import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { templatesApi } from "../services/templates.api";
import { settingsApi } from "../services/settings.api";
import { Button, Input, Spinner, ErrorState, selectBaseClass } from "../components/ui/primitives";
import { toast } from "../store/toast";
import { TemplateCard } from "../components/templates/TemplateCard";
import { TemplateEditor, categoryLabel } from "../components/templates/TemplateEditor";
import { TemplatePreviewModal } from "../components/templates/TemplatePreviewModal";
import { errorMessage } from "../services/errors";
import type { Template } from "../types/api";

/** Filter selects: full width in the 2-column mobile grid, natural width from sm up. */
const filterSelectClass = `w-full sm:w-auto px-2.5 sm:px-3 py-2 text-xs sm:text-sm ${selectBaseClass}`;

export default function Templates() {
  const qc = useQueryClient();
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["templates"], queryFn: templatesApi.list });
  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: settingsApi.listDocuments,
    select: (d) => d.documents,
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
  const profileFields = settings.data?.profileFields ?? [];

  // `undefined` = editor closed, `null` = new template.
  const [editing, setEditing] = useState<Template | null | undefined>(undefined);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState<"all" | "text" | "html">("all");

  const del = useMutation({
    mutationFn: (id: number) => templatesApi.remove(id),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e) => toast.error(errorMessage(e, "Delete failed")),
  });

  const addStarter = useMutation({
    mutationFn: templatesApi.addStarter,
    onSuccess: ({ added }) => {
      toast.success(added ? `Added ${added} starter template${added === 1 ? "" : "s"}` : "You already have all the starter templates");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not add the starter templates")),
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    data.forEach((t) => { if (t.category) set.add(t.category); });
    return Array.from(set);
  }, [data]);

  const filteredData = useMemo(() => {
    const q = search.toLowerCase();
    return data
      .filter((t) => {
        const matchSearch =
          q === "" ||
          t.name.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q);
        const matchCategory = categoryFilter === "all" || t.category === categoryFilter;
        const matchFormat = formatFilter === "all" || (t.format ?? "text") === formatFilter;
        return matchSearch && matchCategory && matchFormat;
      })
      .sort((a, b) => b.id - a.id);
  }, [data, search, categoryFilter, formatFilter]);

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message="Failed to load templates." />;

  const htmlCount = data.filter((t) => t.format === "html").length;

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="text-sm text-gray-600">
            Write the emails your campaigns send, as plain text or as an HTML design. Each campaign picks which templates it rotates through.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => addStarter.mutate()} disabled={addStarter.isPending}>
            {addStarter.isPending ? "Adding…" : "Add starter templates"}
          </Button>
          <Button onClick={() => setEditing(null)}>+ New Template</Button>
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
            aria-label="Format"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value as "all" | "text" | "html")}
            className={filterSelectClass}
          >
            <option value="all">All formats ({data.length})</option>
            <option value="text">Plain text ({data.length - htmlCount})</option>
            <option value="html">HTML designs ({htmlCount})</option>
          </select>
          <select
            aria-label="Category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={filterSelectClass}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filteredData.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            onPreview={() => setPreviewing(t)}
            onEdit={() => setEditing(t)}
            onDelete={() => confirm("Delete this template?") && del.mutate(t.id)}
          />
        ))}
      </div>

      {data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#BAE6FD] bg-[#F1F5F9] p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-transparent">
          <p>No templates yet. Start from the starter set (cold intro, follow-ups, meeting request…) or write your own.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => addStarter.mutate()} disabled={addStarter.isPending}>Add starter templates</Button>
            <Button onClick={() => setEditing(null)}>+ New Template</Button>
          </div>
        </div>
      ) : filteredData.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#BAE6FD] bg-[#F1F5F9] p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-transparent">
          No templates found matching your search or filters.
        </div>
      )}

      {editing !== undefined && (
        <TemplateEditor
          key={editing?.id ?? "new"}
          template={editing}
          documents={documents}
          profile={settings.data?.profile}
          profileFields={profileFields}
          categories={categories}
          onClose={() => setEditing(undefined)}
        />
      )}

      {previewing && (
        <TemplatePreviewModal
          template={previewing}
          profile={settings.data?.profile}
          profileFields={profileFields}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
