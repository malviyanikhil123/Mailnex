import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { templatesApi, type TemplateInput } from "../services/templates.api";
import { settingsApi } from "../services/settings.api";
import { Button, Card, Input, Textarea, Spinner, ErrorState } from "../components/ui/primitives";
import { toast } from "../store/toast";
import type { Template } from "../types/api";

const empty: TemplateInput = { name: "", subject: "", body: "", category: "general", active: false, resumeId: null };

export default function Templates() {
  const qc = useQueryClient();
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["templates"], queryFn: templatesApi.list });
  const { data: resumes = [] } = useQuery({ queryKey: ["resumes"], queryFn: settingsApi.listResumes });
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<TemplateInput>(empty);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const save = useMutation({
    mutationFn: () =>
      editing ? templatesApi.update(editing.id, form) : templatesApi.create(form),
    onSuccess: () => {
      toast.success(editing ? "Template updated" : "Template created");
      qc.invalidateQueries({ queryKey: ["templates"] });
      setOpen(false);
    },
    onError: (e: any) =>
      toast.error(e?.response?.status === 409 ? "Duplicate name + category" : "Save failed"),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      templatesApi.update(id, { active }),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ["templates"] });
      const previous = qc.getQueryData<Template[]>(["templates"]);
      if (previous) {
        qc.setQueryData<Template[]>(
          ["templates"],
          previous.map((t) => (t.id === id ? { ...t, active } : t)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["templates"], context.previous);
      }
      toast.error("Failed to update template selection");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const toggleAll = useMutation({
    mutationFn: async (shouldSelectAll: boolean) => {
      const promises = data
        .filter((t) => t.active !== shouldSelectAll)
        .map((t) => templatesApi.update(t.id, { active: shouldSelectAll }));
      return Promise.all(promises);
    },
    onSuccess: (_data, shouldSelectAll) => {
      toast.success(shouldSelectAll ? "All templates selected" : "All templates deselected");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: () => toast.error("Failed to update template selections"),
  });

  const del = useMutation({
    mutationFn: (id: number) => templatesApi.remove(id),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const doPreview = async (t: Template) => {
    const res = await templatesApi.preview(t.id, {
      company: "Acme Innovations",
      location: "Bengaluru",
      candidateName: "Alex Morgan",
      role: "Product Designer",
      targetRole: "Product Designer",
      experience: "4+ years",
      signature: "Regards,\nAlex Morgan\nPhone: +91 9876543210\nPortfolio: https://alexdesign.work",
    });
    setPreview(res);
  };

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({
      name: t.name,
      subject: t.subject,
      body: t.body,
      category: t.category,
      active: t.active,
      resumeId: t.resumeId ?? null,
    });
    setOpen(true);
  };

  const activeCount = useMemo(() => data.filter((t) => t.active).length, [data]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    data.forEach((t) => { if (t.category) set.add(t.category); });
    return Array.from(set);
  }, [data]);

  const filteredData = useMemo(() => {
    return data
      .filter((t) => {
        const matchSearch =
          search === "" ||
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.subject.toLowerCase().includes(search.toLowerCase()) ||
          t.body.toLowerCase().includes(search.toLowerCase());

        const matchCategory = categoryFilter === "all" || t.category === categoryFilter;

        const matchStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && t.active) ||
          (statusFilter === "inactive" && !t.active);

        return matchSearch && matchCategory && matchStatus;
      })
      .sort((a, b) => b.id - a.id);
  }, [data, search, categoryFilter, statusFilter]);

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message="Failed to load templates." />;

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="text-sm text-gray-600">
            Select which templates to use for your automated campaigns. The system randomly rotates among all checked templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openNew}>+ New Template</Button>
        </div>
      </div>

      {/* Selection Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BAE6FD] bg-[#F1F5F9] p-4 shadow-xs dark:border-[#164549] dark:bg-[#0e2124]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#BAE6FD] px-3 py-1 text-xs font-semibold text-[#0F172A] border border-[#7dd3fc] dark:bg-[#164549] dark:text-[#E3FDFD] dark:border-transparent">
            <span className="h-2 w-2 rounded-full bg-[#60A5FA] animate-pulse"></span>
            {activeCount} of {data.length} Selected for Sending
          </span>
          {activeCount === 0 && (
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              ⚠️ Warning: Select at least 1 template so emails can be sent.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="text-xs"
            disabled={toggleAll.isPending || activeCount === data.length}
            onClick={() => toggleAll.mutate(true)}
          >
            Select All
          </Button>
          <Button
            variant="secondary"
            className="text-xs"
            disabled={toggleAll.isPending || activeCount === 0}
            onClick={() => toggleAll.mutate(false)}
          >
            Deselect All
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Search templates by title, subject or content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full sm:w-auto rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-2.5 sm:px-3 py-2 text-xs sm:text-sm text-gray-900 outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
          >
            <option value="all">All Statuses ({data.length})</option>
            <option value="active">Selected ({activeCount})</option>
            <option value="inactive">Unselected ({data.length - activeCount})</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-2.5 sm:px-3 py-2 text-xs sm:text-sm text-gray-900 outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ").toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filteredData.map((t) => (
          <Card
            key={t.id}
            className={`relative transition-all duration-150 ${
              t.active
                ? "border-[#60A5FA] ring-2 ring-[#60A5FA]/50 dark:border-[#71C9CE] dark:ring-[#71C9CE]/30"
                : "border-[#BAE6FD] dark:border-[#164549]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              {/* Checkbox selector */}
              <label className="flex cursor-pointer items-start gap-3 select-none flex-1">
                <input
                  type="checkbox"
                  checked={t.active}
                  onChange={(e) => toggleActive.mutate({ id: t.id, active: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-[#BAE6FD] text-[#60A5FA] focus:ring-[#60A5FA] dark:border-gray-600 dark:bg-gray-700 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{t.name}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <span className="capitalize font-medium">{t.category.replace(/_/g, " ")}</span>
                    <span>•</span>
                    <span>v{t.version}</span>
                    <span>•</span>
                    {t.resume ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#BAE6FD] px-2 py-0.5 text-[11px] font-semibold text-[#0F172A] border border-[#7dd3fc] dark:bg-[#164549] dark:text-[#E3FDFD] dark:border-transparent">
                        📄 {t.resume.name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-500">
                        📄 Default Resume
                      </span>
                    )}
                    <span>•</span>
                    {t.active ? (
                      <span className="font-semibold text-[#0F172A] dark:text-[#A6E3E9]">
                        ✓ Selected for Sending
                      </span>
                    ) : (
                      <span className="text-gray-500">Inactive (Excluded)</span>
                    )}
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-3 rounded-lg bg-[#F1F5F9] border border-[#BAE6FD]/60 p-2.5 text-xs font-medium text-gray-800 dark:bg-[#122b2f]/60 dark:text-gray-200 dark:border-transparent break-words">
              <span className="text-gray-500 dark:text-gray-500">Subject: </span>
              {t.subject}
            </div>

            <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
              {t.body}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#BAE6FD]/60 pt-3 dark:border-[#164549]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleActive.mutate({ id: t.id, active: !t.active })}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors ${
                    t.active
                      ? "bg-[#60A5FA] text-white hover:bg-[#3B82F6] dark:bg-[#164549] dark:text-[#E3FDFD]"
                      : "bg-[#BAE6FD] text-gray-700 hover:bg-[#93c5fd] dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {t.active ? "✓ Active" : "+ Enable"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <Button variant="secondary" className="text-xs py-1.5 px-2.5" onClick={() => doPreview(t)}>
                  Preview
                </Button>
                <Button variant="secondary" className="text-xs py-1.5 px-2.5" onClick={() => openEdit(t)}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  className="text-xs py-1.5 px-2.5"
                  onClick={() => confirm("Delete this template?") && del.mutate(t.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredData.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#BAE6FD] bg-[#F1F5F9] p-8 text-center text-sm text-gray-600 dark:border-gray-700">
          No templates found matching your search or filters.
        </div>
      )}

      {/* Create / Edit Modal */}
      {open && (
        <Modal onClose={() => setOpen(false)} title={editing ? "Edit Template" : "New Template"}>
          <div className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Template Name
              </label>
              <Input
                placeholder="e.g. Standard Application, Quick Follow-up"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:items-end">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="general">General</option>
                  <option value="direct">Direct</option>
                  <option value="value_proposition">Value Proposition</option>
                  <option value="inquiry">Inquiry</option>
                  <option value="followup">Follow-up</option>
                </select>
              </div>

              <div className="flex items-center gap-2 py-1 sm:py-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium select-none text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={form.active ?? true}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 rounded border-[#BAE6FD] text-[#60A5FA] focus:ring-[#60A5FA] dark:border-gray-600 dark:bg-gray-700 shrink-0"
                  />
                  <span>Select for Sending</span>
                </label>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Connected Resume / CV
              </label>
              <select
                value={form.resumeId ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    resumeId: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Default Resume (Global)</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    📄 {r.name} ({r.fileName})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                When sending emails with this template, this specific resume will be attached. (Manage resumes in Settings)
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Email Subject
              </label>
              <Input
                placeholder="e.g. {{role}} Application — {{candidateName}}"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Email Body
              </label>
              <Textarea
                rows={7}
                placeholder="Write your email body. Supported variables: {{role}}, {{targetRole}}, {{company}}, {{location}}, {{candidateName}}, {{experience}}, {{skills}}, {{signature}}"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
              
              {/* Interactive Clickable Available Tags */}
              <div className="mt-2">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
                  Available tags (tap to insert):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "{{role}}",
                    "{{company}}",
                    "{{location}}",
                    "{{candidateName}}",
                    "{{experience}}",
                    "{{skills}}",
                    "{{signature}}",
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          body:
                            prev.body +
                            (prev.body &&
                            !prev.body.endsWith(" ") &&
                            !prev.body.endsWith("\n")
                              ? " "
                              : "") +
                            tag,
                        }))
                      }
                      className="inline-flex items-center rounded-md bg-[#BAE6FD] hover:bg-[#93c5fd] active:scale-95 px-2 py-0.5 text-xs font-mono font-medium text-[#0F172A] border border-[#7dd3fc] transition dark:bg-[#164549] dark:text-[#E3FDFD] dark:border-transparent dark:hover:bg-[#24666b]"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-[#BAE6FD]/40 dark:border-gray-800">
              <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => save.mutate()}
                disabled={save.isPending || !form.name || !form.subject || !form.body}
              >
                {save.isPending ? "Saving…" : "Save Template"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Preview Modal */}
      {preview && (
        <Modal onClose={() => setPreview(null)} title="Template Preview (Rendered Sample)">
          <div className="space-y-3">
            <div className="rounded-lg bg-[#BAE6FD] border border-[#BAE6FD] p-3 text-sm dark:bg-gray-800 dark:border-transparent break-words">
              <div className="font-semibold text-gray-900 dark:text-gray-100">{preview.subject}</div>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-[#F1F5F9] border border-[#BAE6FD] p-3.5 sm:p-4 text-xs font-sans text-gray-800 leading-relaxed dark:bg-gray-800 dark:text-gray-200 dark:border-transparent max-h-60 overflow-y-auto">
              {preview.body}
            </pre>
            <div className="flex justify-end pt-2">
              <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-[#F1F5F9] border border-[#BAE6FD] p-4 sm:p-6 shadow-2xl dark:bg-gray-900 dark:border-gray-800 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-700 hover:bg-[#BAE6FD]/40 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
