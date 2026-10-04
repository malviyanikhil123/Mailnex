import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, Sparkles, ChevronRight } from "lucide-react";
import { inboxApi, type CategoryInput } from "../services/inbox.api";
import { Button, Card, Input, Textarea, Spinner, ErrorState } from "../components/ui/primitives";
import { Modal } from "../components/ui/Modal";
import { RuleEditor } from "../components/inbox/RuleEditor";
import { useJobProgress } from "../hooks/useJobProgress";
import { toast } from "../store/toast";
import type { InboxCategory, InboxClassifyResult } from "../types/api";

const PRESET_COLORS = ["#F59E0B", "#10B981", "#3B82F6", "#EF4444", "#8B5CF6", "#6366F1", "#EC4899", "#14B8A6"];

export default function InboxCategories() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<InboxCategory | "new" | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<InboxCategory | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [confirmReclassifyAll, setConfirmReclassifyAll] = useState(false);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["inbox"] });

  const categoriesQ = useQuery({
    queryKey: ["inbox", "categories"],
    queryFn: inboxApi.listCategories,
  });
  const statsQ = useQuery({ queryKey: ["inbox", "stats"], queryFn: inboxApi.stats });

  const categories = categoriesQ.data?.categories ?? [];

  const classifyProgress = useJobProgress((p) => {
    invalidate();
    const result = p?.result as InboxClassifyResult | undefined;
    if (p?.error) toast.error(p.error);
    else if (result?.outcome === "no_categories") toast.error("Define a category first");
    else if (result?.outcome === "nothing_to_do") toast.success("Nothing left to sort");
    else if (result) {
      toast.success(
        `Sorted ${result.examined} — ${result.byRule} by rules, ${result.byAi} by AI, ${result.uncategorized} unsorted` +
          (result.skippedManual > 0 ? ` · ${result.skippedManual} of your manual picks kept` : ""),
      );
    }
  });

  const startClassify = useMutation({
    mutationFn: (mode: "new" | "all") => inboxApi.startClassify(mode),
    onSuccess: ({ jobId }) => {
      setConfirmReclassifyAll(false);
      classifyProgress.start(jobId);
    },
    onError: (err) => {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      toast.error(code === "NO_CATEGORIES" ? "Define a category first" : "Could not start sorting");
    },
  });

  const saveCategory = useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: CategoryInput }) =>
      id === null ? inboxApi.createCategory(input) : inboxApi.updateCategory(id, input),
    onSuccess: () => {
      setEditing(null);
      invalidate();
      toast.success("Category saved");
    },
    onError: (err) => {
      const res = (err as { response?: { status?: number; data?: { message?: string } } }).response;
      toast.error(
        res?.status === 409
          ? "You already have a category with that name"
          : res?.data?.message ?? "Could not save that category",
      );
    },
  });

  const deleteCategory = useMutation({
    mutationFn: ({ id, to }: { id: number; to: number | null }) => inboxApi.deleteCategory(id, to),
    onSuccess: ({ reassigned }) => {
      setDeleting(null);
      setReassignTo("");
      invalidate();
      toast.success(
        reassigned > 0
          ? `Category removed — ${reassigned} email${reassigned === 1 ? "" : "s"} moved, none deleted`
          : "Category removed",
      );
    },
    onError: () => toast.error("Could not remove that category"),
  });

  const seedDefaults = useMutation({
    mutationFn: inboxApi.seedDefaultCategories,
    onSuccess: ({ created }) => {
      invalidate();
      toast.success(created > 0 ? `Added ${created} suggested categories` : "You already have all of them");
    },
    onError: () => toast.error("Could not add the suggested categories"),
  });

  if (categoriesQ.isLoading) return <Spinner />;
  if (categoriesQ.isError) return <ErrorState message="Could not load your categories." />;

  const manualCount = statsQ.data?.byManual ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/inbox"
            className="mb-1 inline-flex items-center gap-1 text-xs text-gray-600 hover:underline dark:text-gray-400"
          >
            <ArrowLeft size={12} />
            Back to inbox
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
            Categories &amp; rules
          </h1>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Rules run first and are free. Only mail no rule matches is sent to the AI.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
            Add suggested
          </Button>
          <Button onClick={() => setEditing("new")} className="flex items-center gap-1.5">
            <Plus size={14} />
            New category
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Re-sort your mail</h2>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {classifyProgress.progress && !classifyProgress.progress.done
              ? `${classifyProgress.progress.phase} — ${classifyProgress.progress.processed}/${classifyProgress.progress.total}`
              : "Run this after changing rules. Your manual choices are always kept."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={classifyProgress.isRunning || startClassify.isPending}
            onClick={() => startClassify.mutate("new")}
            className="flex items-center gap-1.5"
          >
            <Sparkles size={14} />
            Only unsorted
          </Button>
          <Button
            variant="secondary"
            disabled={classifyProgress.isRunning || startClassify.isPending}
            onClick={() => setConfirmReclassifyAll(true)}
          >
            Re-sort everything
          </Button>
        </div>
      </Card>

      {categories.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You have no categories yet, so nothing is being sorted. Add the suggested set to get
            going, or create your own — every field is editable either way.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <Card key={c.id} className="!p-0">
              <div className="flex flex-wrap items-center gap-2 p-3">
                <button
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={expanded === c.id}
                >
                  <ChevronRight
                    size={15}
                    className={`shrink-0 text-gray-400 transition ${expanded === c.id ? "rotate-90" : ""}`}
                  />
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {c.name}
                  </span>
                  {c.trackSubStatus && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      tracks stages
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-500">
                    {c.ruleCount} rule{c.ruleCount === 1 ? "" : "s"} · {c.messageCount} email
                    {c.messageCount === 1 ? "" : "s"}
                  </span>
                </button>
                <button
                  onClick={() => setEditing(c)}
                  className="rounded p-1.5 text-gray-400 transition hover:bg-[#BAE6FD]/40 hover:text-gray-700 dark:hover:bg-gray-800"
                  aria-label={`Edit ${c.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => {
                    setDeleting(c);
                    setReassignTo("");
                  }}
                  className="rounded p-1.5 text-gray-400 transition hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
                  aria-label={`Remove ${c.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {expanded === c.id && (
                <div className="border-t border-[#BAE6FD] p-3 dark:border-[#164549]">
                  {c.description && (
                    <p className="mb-2 text-xs italic text-gray-500 dark:text-gray-500">
                      AI reads: &ldquo;{c.description}&rdquo;
                    </p>
                  )}
                  <RuleEditor category={c} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <CategoryFormModal
          category={editing === "new" ? null : editing}
          pending={saveCategory.isPending}
          onClose={() => setEditing(null)}
          onSave={(input) =>
            saveCategory.mutate({ id: editing === "new" ? null : editing.id, input })
          }
        />
      )}

      {deleting && (
        <Modal title={`Remove "${deleting.name}"?`} onClose={() => setDeleting(null)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {deleting.messageCount > 0
                ? `${deleting.messageCount} email${deleting.messageCount === 1 ? "" : "s"} are filed here. No email is ever deleted with a category — choose where they should go.`
                : "No email is filed here, so nothing will move."}
            </p>
            {deleting.messageCount > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Move them to
                </span>
                <select
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  className="w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm outline-none dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
                >
                  <option value="">Uncategorized</option>
                  {categories
                    .filter((c) => c.id !== deleting.id)
                    .map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                </select>
              </label>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Its {deleting.ruleCount} rule{deleting.ruleCount === 1 ? "" : "s"} will be removed too.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={deleteCategory.isPending}
                onClick={() =>
                  deleteCategory.mutate({
                    id: deleting.id,
                    to: reassignTo ? Number(reassignTo) : null,
                  })
                }
              >
                {deleteCategory.isPending ? "Removing…" : "Remove category"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmReclassifyAll && (
        <Modal title="Re-sort everything?" onClose={() => setConfirmReclassifyAll(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Every email will be re-checked against your current rules, then the AI.
            </p>
            <p className="rounded-lg border border-[#BAE6FD] bg-[#E0F2FE] p-3 text-xs text-gray-700 dark:border-[#164549] dark:bg-[#091517] dark:text-gray-400">
              {manualCount > 0
                ? `Your ${manualCount} manual assignment${manualCount === 1 ? "" : "s"} will be kept exactly as they are.`
                : "Any email you move by hand is always kept as you left it."}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setConfirmReclassifyAll(false)}>Cancel</Button>
              <Button disabled={startClassify.isPending} onClick={() => startClassify.mutate("all")}>
                {startClassify.isPending ? "Starting…" : "Re-sort everything"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CategoryFormModal({
  category,
  pending,
  onClose,
  onSave,
}: {
  category: InboxCategory | null;
  pending: boolean;
  onClose: () => void;
  onSave: (input: CategoryInput) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [color, setColor] = useState(category?.color ?? PRESET_COLORS[2]!);
  const [trackSubStatus, setTrackSubStatus] = useState(category?.trackSubStatus ?? false);

  return (
    <Modal title={category ? `Edit "${category.name}"` : "New category"} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bills" />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Description
          </span>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Utility and phone bills, payment-due reminders, receipts."
          />
          <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-500">
            This description is what the AI reads — describe the emails, not the label.
          </span>
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">Colour</span>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Use colour ${c}`}
                aria-pressed={color === c}
                className={`h-7 w-7 rounded-full transition ${
                  color === c ? "ring-2 ring-offset-2 ring-gray-500 dark:ring-offset-gray-900" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={trackSubStatus}
            onChange={(e) => setTrackSubStatus(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#60A5FA] dark:accent-[#71C9CE]"
          />
          <span className="text-xs text-gray-700 dark:text-gray-300">
            <strong className="font-semibold">Track application status on this category</strong>
            <span className="block text-gray-500 dark:text-gray-500">
              Adds the Applied → Interview → Offer pipeline. Turning it off clears any stages
              already recorded here.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name.trim() || pending}
            onClick={() =>
              onSave({ name: name.trim(), description: description.trim(), color, trackSubStatus })
            }
          >
            {pending ? "Saving…" : "Save category"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
