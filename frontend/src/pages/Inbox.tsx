import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Trash2, X, Tag } from "lucide-react";
import { inboxApi, type ListMessagesParams } from "../services/inbox.api";
import { Button, Card, Input, Spinner, ErrorState } from "../components/ui/primitives";
import { CategorySidebar, type Selection } from "../components/inbox/CategorySidebar";
import { MessageRow } from "../components/inbox/MessageRow";
import { MessageDrawer } from "../components/inbox/MessageDrawer";
import { SyncBanner } from "../components/inbox/SyncBanner";
import { JobPipeline } from "../components/inbox/JobPipeline";
import { DeleteConfirmModal } from "../components/inbox/DeleteConfirmModal";
import { useJobProgress } from "../hooks/useJobProgress";
import { toast } from "../store/toast";
import type {
  InboxClassifyResult, InboxDeleteResult, InboxSyncResult, JobApplicationStatus,
} from "../types/api";

export default function Inbox() {
  const qc = useQueryClient();
  const [selection, setSelection] = useState<Selection>("all");
  const [search, setSearch] = useState("");
  const [jobStatus, setJobStatus] = useState<JobApplicationStatus | null>(null);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [deleteTargets, setDeleteTargets] = useState<number[] | null>(null);
  const [deleteResult, setDeleteResult] = useState<InboxDeleteResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const lastClickedIndex = useRef<number | null>(null);

  const invalidateAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["inbox"] });
  }, [qc]);

  // ---- server state -------------------------------------------------------

  const categoriesQ = useQuery({
    queryKey: ["inbox", "categories"],
    queryFn: inboxApi.listCategories,
  });

  const statsQ = useQuery({
    queryKey: ["inbox", "stats"],
    queryFn: inboxApi.stats,
    refetchInterval: 15000,
  });

  const syncStateQ = useQuery({
    queryKey: ["inbox", "sync-state"],
    queryFn: inboxApi.syncState,
    refetchInterval: 30000,
  });

  const categories = categoriesQ.data?.categories ?? [];
  const hasCategories = categories.length > 0;

  const listParams: ListMessagesParams = useMemo(
    () => ({
      ...(selection === "all" || selection === "trash"
        ? {}
        : { categoryId: selection }),
      state: selection === "trash" ? ("TRASHED" as const) : ("ACTIVE" as const),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(jobStatus ? { jobStatus } : {}),
      page,
      limit: 25,
    }),
    [selection, search, jobStatus, page],
  );

  const messagesQ = useQuery({
    queryKey: ["inbox", "messages", listParams],
    queryFn: () => inboxApi.listMessages(listParams),
  });

  const messages = messagesQ.data?.messages ?? [];
  const total = messagesQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  const openMessageQ = useQuery({
    queryKey: ["inbox", "message", openId],
    queryFn: () => inboxApi.getMessage(openId!),
    enabled: openId !== null,
  });

  const activeCategory = typeof selection === "number"
    ? categories.find((c) => c.id === selection)
    : undefined;

  // ---- jobs ---------------------------------------------------------------

  const syncProgress = useJobProgress((p) => {
    invalidateAll();
    const result = p?.result as InboxSyncResult | undefined;
    if (p?.error) toast.error(p.error);
    else if (result?.outcome === "ok") {
      toast.success(
        result.inserted > 0
          ? `Pulled ${result.inserted} new email${result.inserted === 1 ? "" : "s"}`
          : "Your inbox is already up to date",
      );
    } else if (result?.outcome === "skipped") {
      toast.success("Nothing to sync right now");
    } else if (result?.errorMessage) {
      toast.error(result.errorMessage);
    }
  });

  const classifyProgress = useJobProgress((p) => {
    invalidateAll();
    const result = p?.result as InboxClassifyResult | undefined;
    if (p?.error) toast.error(p.error);
    else if (result?.outcome === "no_categories") toast.error("Define a category first");
    else if (result?.outcome === "nothing_to_do") toast.success("Nothing left to sort");
    else if (result) {
      toast.success(
        `Sorted ${result.examined} — ${result.byRule} by rules, ${result.byAi} by AI, ${result.uncategorized} unsorted`,
      );
    }
  });

  const startSync = useMutation({
    mutationFn: inboxApi.startSync,
    onSuccess: ({ jobId }) => syncProgress.start(jobId),
    onError: () => toast.error("Could not start the sync — check your Gmail settings"),
  });

  const startClassify = useMutation({
    mutationFn: (mode: "new" | "all") => inboxApi.startClassify(mode),
    onSuccess: ({ jobId }) => classifyProgress.start(jobId),
    onError: () => toast.error("Could not start sorting"),
  });

  const seedDefaults = useMutation({
    mutationFn: inboxApi.seedDefaultCategories,
    onSuccess: ({ created }) => {
      invalidateAll();
      toast.success(`Added ${created} suggested categories — edit them any time`);
    },
    onError: () => toast.error("Could not add the suggested categories"),
  });

  // ---- mutations ----------------------------------------------------------

  /** Optimistic, mirroring the pattern in Templates.tsx. */
  const setCategory = useMutation({
    mutationFn: ({ id, categoryId }: { id: number; categoryId: number | null }) =>
      inboxApi.setCategory(id, categoryId),
    onMutate: async ({ id, categoryId }) => {
      const key = ["inbox", "messages", listParams];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      qc.setQueryData(key, (old: typeof messagesQ.data) =>
        old
          ? {
              ...old,
              messages: old.messages.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      categoryId,
                      categoryName: categories.find((c) => c.id === categoryId)?.name ?? null,
                      assignmentSource: "MANUAL" as const,
                      manualOverride: true,
                      matchedRuleLabel: null,
                      aiConfidence: null,
                      aiReason: null,
                    }
                  : m,
              ),
            }
          : old,
      );
      return { previous, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.previous);
      toast.error("Could not move that email");
    },
    onSettled: invalidateAll,
  });

  const setJobStatusMut = useMutation({
    mutationFn: ({ id, categoryId, status }: { id: number; categoryId: number | null; status: JobApplicationStatus | null }) =>
      inboxApi.setCategory(id, categoryId, status),
    onSuccess: () => {
      invalidateAll();
      void qc.invalidateQueries({ queryKey: ["inbox", "message", openId] });
    },
    onError: () => toast.error("Could not update the application stage"),
  });

  const bulkMove = useMutation({
    mutationFn: ({ ids, categoryId }: { ids: number[]; categoryId: number | null }) =>
      inboxApi.bulkSetCategory(ids, categoryId),
    onSuccess: ({ updated }) => {
      setSelectedIds(new Set());
      setBulkCategory("");
      invalidateAll();
      toast.success(`Moved ${updated} email${updated === 1 ? "" : "s"}`);
    },
    onError: () => toast.error("Could not move those emails"),
  });

  const deleteMessages = useMutation({
    mutationFn: (ids: number[]) => inboxApi.deleteMessages(ids),
    onSuccess: (res) => {
      invalidateAll();
      if (res.failed === 0) {
        setDeleteTargets(null);
        setDeleteResult(null);
        setSelectedIds(new Set());
        setOpenId(null);
        toast.success(`Moved ${res.trashed} to Gmail Trash`);
      } else {
        // Keep the dialog open — those messages are back in the inbox and the
        // user needs to see which ones and why.
        setDeleteResult(res);
        toast.error(`${res.failed} could not be moved — they are back in your inbox`);
      }
    },
    onError: () => toast.error("Could not move those emails to Trash"),
  });

  const verify = async () => {
    setVerifying(true);
    try {
      const res = await inboxApi.verify();
      toast.success(`Connected — Gmail reports ${res.mailbox.exists} emails in your inbox`);
      invalidateAll();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Could not connect to Gmail";
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  };

  // ---- selection ----------------------------------------------------------

  const toggleSelect = (id: number, shiftKey: boolean) => {
    const index = messages.findIndex((m) => m.id === id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      // Shift-click extends from the last clicked row, like a normal mail client.
      if (shiftKey && lastClickedIndex.current !== null && index >= 0) {
        const [from, to] = [lastClickedIndex.current, index].sort((a, b) => a - b);
        for (let i = from; i <= to; i++) next.add(messages[i]!.id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (index >= 0) lastClickedIndex.current = index;
  };

  const allOnPageSelected = messages.length > 0 && messages.every((m) => selectedIds.has(m.id));

  const changeSelection = (s: Selection) => {
    setSelection(s);
    setPage(1);
    setSelectedIds(new Set());
    setJobStatus(null);
  };

  // ---- render -------------------------------------------------------------

  if (categoriesQ.isLoading || syncStateQ.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">Inbox</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Sorted in Mailnex. Your Gmail labels and folders are never changed.
          </p>
        </div>
        <Link to="/inbox/categories">
          <Button variant="secondary" className="flex items-center gap-1.5">
            <Tag size={14} />
            Categories &amp; rules
          </Button>
        </Link>
      </div>

      <SyncBanner
        syncState={syncStateQ.data}
        progress={syncProgress.progress ?? classifyProgress.progress}
        isSyncing={syncProgress.isRunning || startSync.isPending}
        isClassifying={classifyProgress.isRunning || startClassify.isPending}
        onSync={() => startSync.mutate()}
        onClassify={() => startClassify.mutate("new")}
        onVerify={verify}
        verifying={verifying}
      />

      {/* Sorting is off until categories exist — stated plainly, and no classify
          request is issued from this state at all. */}
      {!hasCategories && (
        <Card>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
            Sorting is off until you define categories
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Your mail is still being collected — it just isn&apos;t being filed yet. Categories are
            personal, so start from a suggested set and edit it, or build your own.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
              {seedDefaults.isPending ? "Adding…" : "Use suggested categories"}
            </Button>
            <Link to="/inbox/categories">
              <Button variant="secondary">Create my own</Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-4 md:flex-row">
        <CategorySidebar stats={statsQ.data} selected={selection} onSelect={changeSelection} />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search sender, subject or preview…"
              className="pl-9"
            />
          </div>

          {activeCategory?.trackSubStatus && (
            <JobPipeline
              stats={statsQ.data}
              activeStatus={jobStatus}
              onSelectStatus={(s) => {
                setJobStatus(s);
                setPage(1);
              }}
            />
          )}

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#60A5FA] bg-[#E0F2FE] p-3 dark:border-[#71C9CE] dark:bg-[#091517]">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {selectedIds.size} selected
              </span>
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                aria-label="Move selected to category"
                className="rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-2 py-1.5 text-sm outline-none dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-200"
              >
                <option value="">Move to…</option>
                <option value="uncategorized">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                disabled={!bulkCategory || bulkMove.isPending}
                onClick={() =>
                  bulkMove.mutate({
                    ids: [...selectedIds],
                    categoryId: bulkCategory === "uncategorized" ? null : Number(bulkCategory),
                  })
                }
              >
                {bulkMove.isPending ? "Moving…" : "Move"}
              </Button>
              <Button
                variant="danger"
                className="flex items-center gap-1.5"
                onClick={() => {
                  setDeleteResult(null);
                  setDeleteTargets([...selectedIds]);
                }}
              >
                <Trash2 size={14} />
                Move to Gmail Trash
              </Button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="flex items-center gap-1 text-xs text-gray-600 underline dark:text-gray-400"
              >
                <X size={12} />
                Clear
              </button>
            </div>
          )}

          <Card className="!p-0">
            {messages.length > 0 && (
              <div className="flex items-center gap-3 border-b border-[#BAE6FD] px-3 py-2 dark:border-[#164549]">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={(e) =>
                    setSelectedIds(e.target.checked ? new Set(messages.map((m) => m.id)) : new Set())
                  }
                  className="h-4 w-4 rounded border-gray-400 accent-[#60A5FA] dark:accent-[#71C9CE]"
                  aria-label="Select all on this page"
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {total} email{total === 1 ? "" : "s"}
                  {selection === "trash" && " · recoverable in Gmail's Trash for 30 days"}
                </span>
              </div>
            )}

            {messagesQ.isLoading ? (
              <Spinner />
            ) : messagesQ.isError ? (
              <div className="p-4">
                <ErrorState message="Could not load your mail." />
              </div>
            ) : messages.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {search
                  ? "No emails match that search."
                  : selection === "trash"
                    ? "Nothing here. Emails you move to Gmail Trash will be listed here for 7 days."
                    : syncStateQ.data?.lastSyncAt
                      ? "No emails in this category yet."
                      : "Nothing yet — press Sync now to pull your inbox."}
              </p>
            ) : (
              messages.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  categories={categories}
                  selected={selectedIds.has(m.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={setOpenId}
                  onChangeCategory={(id, categoryId) => setCategory.mutate({ id, categoryId })}
                />
              ))
            )}
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      {openId !== null && (
        <MessageDrawer
          message={openMessageQ.data}
          loading={openMessageQ.isLoading}
          categories={categories}
          onClose={() => setOpenId(null)}
          onChangeCategory={(categoryId) => setCategory.mutate({ id: openId, categoryId })}
          onChangeJobStatus={(status) =>
            setJobStatusMut.mutate({
              id: openId,
              categoryId: openMessageQ.data?.categoryId ?? null,
              status,
            })
          }
          onDelete={() => {
            setDeleteResult(null);
            setDeleteTargets([openId]);
          }}
        />
      )}

      {deleteTargets && (
        <DeleteConfirmModal
          count={deleteTargets.length}
          pending={deleteMessages.isPending}
          result={deleteResult}
          onConfirm={() => deleteMessages.mutate(deleteTargets)}
          onClose={() => {
            setDeleteTargets(null);
            setDeleteResult(null);
          }}
        />
      )}
    </div>
  );
}
