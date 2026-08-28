import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { templatesApi, type TemplateInput } from "../services/templates.api";
import { Button, Card, Input, Textarea, Spinner, ErrorState } from "../components/ui/primitives";
import { toast } from "../store/toast";
import type { Template } from "../types/api";

const empty: TemplateInput = { name: "", subject: "", body: "", category: "general", active: false };

export default function Templates() {
  const qc = useQueryClient();
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["templates"], queryFn: templatesApi.list });
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
    setForm({ name: t.name, subject: t.subject, body: t.body, category: t.category, active: t.active });
    setOpen(true);
  };

  const activeCount = useMemo(() => data.filter((t) => t.active).length, [data]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    data.forEach((t) => { if (t.category) set.add(t.category); });
    return Array.from(set);
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((t) => {
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
    });
  }, [data, search, categoryFilter, statusFilter]);

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message="Failed to load templates." />;

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="text-sm text-gray-500">
            Select which templates to use for your automated campaigns. The system randomly rotates among all checked templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openNew}>+ New Template</Button>
        </div>
      </div>

      {/* Selection Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#CBF1F5] bg-white p-4 shadow-xs dark:border-[#164549] dark:bg-[#0e2124]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E3FDFD] px-3 py-1 text-xs font-semibold text-[#144b50] border border-[#A6E3E9] dark:bg-[#164549] dark:text-[#E3FDFD]">
            <span className="h-2 w-2 rounded-full bg-[#71C9CE] animate-pulse"></span>
            {activeCount} of {data.length} Selected for Sending
          </span>
          {activeCount === 0 && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Search templates by title, subject or content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-[#CBF1F5] bg-white px-3 py-2 text-sm dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
          >
            <option value="all">All Statuses ({data.length})</option>
            <option value="active">Selected Only ({activeCount})</option>
            <option value="inactive">Unselected Only ({data.length - activeCount})</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-[#CBF1F5] bg-white px-3 py-2 text-sm dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
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
                ? "border-[#71C9CE] ring-1 ring-[#71C9CE]/50 dark:border-[#71C9CE] dark:ring-[#71C9CE]/30"
                : "opacity-80 border-[#CBF1F5]/60 dark:border-[#164549]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              {/* Checkbox selector */}
              <label className="flex cursor-pointer items-start gap-3 select-none flex-1">
                <input
                  type="checkbox"
                  checked={t.active}
                  onChange={(e) => toggleActive.mutate({ id: t.id, active: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-[#71C9CE] focus:ring-[#71C9CE] dark:border-gray-600 dark:bg-gray-700"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{t.name}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="capitalize">{t.category.replace(/_/g, " ")}</span>
                    <span>•</span>
                    <span>v{t.version}</span>
                    <span>•</span>
                    {t.active ? (
                      <span className="font-medium text-[#24666b] dark:text-[#A6E3E9]">
                        ✓ Selected for Sending
                      </span>
                    ) : (
                      <span className="text-gray-400">Inactive (Excluded)</span>
                    )}
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-3 rounded-lg bg-[#E3FDFD]/50 p-2.5 text-xs font-medium text-gray-800 dark:bg-[#122b2f]/60 dark:text-gray-200">
              <span className="text-gray-400 dark:text-gray-500">Subject: </span>
              {t.subject}
            </div>

            <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
              {t.body}
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-[#CBF1F5]/40 pt-3 dark:border-[#164549]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleActive.mutate({ id: t.id, active: !t.active })}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                    t.active
                      ? "bg-[#E3FDFD] text-[#144b50] hover:bg-[#CBF1F5] dark:bg-[#164549] dark:text-[#E3FDFD]"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {t.active ? "✓ Active" : "+ Enable"}
                </button>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" className="text-xs py-1 px-2.5" onClick={() => doPreview(t)}>
                  Preview
                </Button>
                <Button variant="secondary" className="text-xs py-1 px-2.5" onClick={() => openEdit(t)}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  className="text-xs py-1 px-2.5"
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
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          No templates found matching your search or filters.
        </div>
      )}

      {/* Create / Edit Modal */}
      {open && (
        <Modal onClose={() => setOpen(false)} title={editing ? "Edit Template" : "New Template"}>
          <div className="space-y-3">
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <option value="general">General</option>
                  <option value="direct">Direct</option>
                  <option value="value_proposition">Value Proposition</option>
                  <option value="inquiry">Inquiry</option>
                  <option value="followup">Follow-up</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-5">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.active ?? true}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Select for Sending</span>
                </label>
              </div>
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
                rows={9}
                placeholder="Write your email body. Supported variables: {{role}}, {{targetRole}}, {{company}}, {{location}}, {{candidateName}}, {{experience}}, {{skills}}, {{signature}}"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500">
                Available tags: <code className="text-blue-600">{"{{role}}"}</code>, <code className="text-blue-600">{"{{company}}"}</code>, <code className="text-blue-600">{"{{location}}"}</code>, <code className="text-blue-600">{"{{candidateName}}"}</code>, <code className="text-blue-600">{"{{signature}}"}</code>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name || !form.subject || !form.body}>
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
            <div className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">
              <div className="font-semibold text-gray-900 dark:text-gray-100">{preview.subject}</div>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-gray-100 p-4 text-xs font-sans text-gray-800 leading-relaxed dark:bg-gray-800 dark:text-gray-200">
              {preview.body}
            </pre>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setPreview(null)}>
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
