import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { templatesApi, type TemplateInput } from "../services/templates.api";
import { Button, Card, Input, Textarea, Spinner, ErrorState } from "../components/ui/primitives";
import { toast } from "../store/toast";
import type { Template } from "../types/api";

const empty: TemplateInput = { name: "", subject: "", body: "", category: "general" };

export default function Templates() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["templates"], queryFn: templatesApi.list });
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<TemplateInput>(empty);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);

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

  const del = useMutation({
    mutationFn: (id: number) => templatesApi.remove(id),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const doPreview = async (t: Template) => {
    const res = await templatesApi.preview(t.id, {
      company: "Acme Corp",
      location: "Berlin",
      candidateName: "Nikhil Malviya",
      signature: "Regards,\nNikhil Malviya",
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
    setForm({ name: t.name, subject: t.subject, body: t.body, category: t.category });
    setOpen(true);
  };

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message="Failed to load templates." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Templates</h1>
        <Button onClick={openNew}>New Template</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data!.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-gray-500">
                  {t.category} · v{t.version} · {t.active ? "active" : "inactive"}
                </div>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t.subject}</div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => doPreview(t)}>
                Preview
              </Button>
              <Button variant="secondary" onClick={() => openEdit(t)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => confirm("Delete?") && del.mutate(t.id)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)} title={editing ? "Edit Template" : "New Template"}>
          <div className="space-y-3">
            <Input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <Input
              placeholder="Subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
            <Textarea
              rows={8}
              placeholder="Body — use {{company}}, {{location}}, {{candidateName}}, {{signature}}"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {preview && (
        <Modal onClose={() => setPreview(null)} title="Preview">
          <div className="space-y-2">
            <div className="font-semibold">{preview.subject}</div>
            <pre className="whitespace-pre-wrap rounded-lg bg-gray-100 p-3 text-sm dark:bg-gray-800">
              {preview.body}
            </pre>
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
