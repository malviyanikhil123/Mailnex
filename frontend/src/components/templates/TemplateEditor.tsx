import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { templatesApi, type TemplateInput } from "../../services/templates.api";
import { Button, Input, Textarea } from "../ui/primitives";
import { Modal } from "../ui/Modal";
import { toast } from "../../store/toast";
import { errorMessage } from "../settings/shared";
import type { ProfileField, SenderProfile, Template, TemplateFormat, UserDocument } from "../../types/api";
import { HtmlPreview } from "./HtmlPreview";
import { GenerateHtmlDialog } from "./GenerateHtmlDialog";
import { VariablePicker } from "./VariablePicker";
import { looksLikeHtml, renderHtmlPreview, sampleVars, textToHtml } from "./variables";

/** Categories offered for new templates; "followup" ones only go to contacts already emailed. */
export const TEMPLATE_CATEGORIES: { value: string; label: string }[] = [
  { value: "general", label: "General" },
  { value: "sales", label: "Sales" },
  { value: "partnership", label: "Partnership" },
  { value: "meeting", label: "Meeting request" },
  { value: "offer", label: "Offer" },
  { value: "reengagement", label: "Re-engagement" },
  { value: "application", label: "Application" },
  { value: "followup", label: "Follow-up" },
];

export function categoryLabel(value: string): string {
  return TEMPLATE_CATEGORIES.find((c) => c.value === value)?.label ?? value.replace(/_/g, " ");
}

const MAX_BODY_BYTES = 100 * 1024;

const selectClass =
  "w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";
const labelClass = "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300";

function initialForm(t: Template | null): Required<TemplateInput> {
  return t
    ? { name: t.name, subject: t.subject, body: t.body, format: t.format ?? "text", category: t.category, documentId: t.documentId ?? null }
    : { name: "", subject: "", body: "", format: "text", category: "general", documentId: null };
}

/** Create / edit a template: plain text, or an HTML design with code + live preview. */
export function TemplateEditor({
  template,
  documents,
  profile,
  profileFields,
  categories,
  onClose,
}: {
  template: Template | null;
  documents: UserDocument[];
  profile?: SenderProfile;
  profileFields: ProfileField[];
  /** Categories already used by the user's templates (kept selectable). */
  categories: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => initialForm(template));
  const [generating, setGenerating] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");

  const isHtml = form.format === "html";
  const vars = useMemo(() => sampleVars(profile, profileFields), [profile, profileFields]);
  const previewHtml = useMemo(() => (isHtml ? renderHtmlPreview(form.body, vars) : ""), [isHtml, form.body, vars]);
  const bodyBytes = useMemo(() => new TextEncoder().encode(form.body).length, [form.body]);
  const tooBig = bodyBytes > MAX_BODY_BYTES;

  const categoryOptions = useMemo(() => {
    const extra = [...categories, form.category].filter((c) => c && !TEMPLATE_CATEGORIES.some((k) => k.value === c));
    return [...TEMPLATE_CATEGORIES, ...[...new Set(extra)].map((c) => ({ value: c, label: categoryLabel(c) }))];
  }, [categories, form.category]);

  const save = useMutation({
    mutationFn: () => (template ? templatesApi.update(template.id, form) : templatesApi.create(form)),
    onSuccess: () => {
      toast.success(template ? "Template updated" : "Template created");
      qc.invalidateQueries({ queryKey: ["templates"] });
      onClose();
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { status?: number } })?.response?.status === 409
          ? "A template with this name and category already exists"
          : errorMessage(e, "Save failed"),
      ),
  });

  const setFormat = (format: TemplateFormat) => {
    if (format === form.format) return;
    setForm((f) => ({
      ...f,
      format,
      // Plain text moves over as simple paragraphs so nothing is lost.
      body: format === "html" && f.body.trim() && !looksLikeHtml(f.body) ? textToHtml(f.body) : f.body,
    }));
  };

  /** Inserts a {{variable}} at the cursor of the subject or body, whichever was used last. */
  const insert = (token: string) => {
    const field = lastFocused.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const value = form[field];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setForm((f) => ({ ...f, [field]: value.slice(0, start) + token + value.slice(end) }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const canSave = form.name.trim() && form.subject.trim() && form.body.trim() && !tooBig && !save.isPending;

  return (
    <>
      <Modal onClose={onClose} title={template ? "Edit template" : "New template"} maxWidth={isHtml ? "max-w-6xl" : "max-w-2xl"}>
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tpl-name" className={labelClass}>Template name</label>
              <Input
                id="tpl-name"
                placeholder="e.g. Cold intro, Spring newsletter"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="tpl-category" className={labelClass}>Category</label>
              <select
                id="tpl-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={selectClass}
              >
                {categoryOptions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                Follow-up templates only go to contacts a campaign has already emailed.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className={labelClass}>Format</span>
              <div role="radiogroup" aria-label="Format" className="inline-flex w-full rounded-lg border border-[#BAE6FD] p-0.5 dark:border-gray-700">
                {(["text", "html"] as TemplateFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={form.format === f}
                    onClick={() => setFormat(f)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      form.format === f
                        ? "bg-[#60A5FA] text-white dark:bg-[#71C9CE] dark:text-gray-950"
                        : "text-gray-700 hover:bg-[#E0F2FE] dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    {f === "text" ? "Plain text" : "HTML design"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="tpl-document" className={labelClass}>Attach document</label>
              <select
                id="tpl-document"
                value={form.documentId ?? ""}
                onChange={(e) => setForm({ ...form, documentId: e.target.value ? Number(e.target.value) : null })}
                className={selectClass}
              >
                <option value="">No attachment</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>📄 {d.name} ({d.fileName})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="tpl-subject" className={labelClass}>Subject (plain text)</label>
            <Input
              id="tpl-subject"
              ref={subjectRef}
              placeholder="e.g. Idea for {{company|your team}}"
              value={form.subject}
              onFocus={() => (lastFocused.current = "subject")}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>

          {isHtml ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-gray-600 dark:text-gray-400">
                  AI personalization applies to plain-text templates; HTML designs are sent as designed, with variables filled in.
                  Scripts, forms and embeds are removed when you save.
                </p>
                <Button type="button" variant="secondary" className="text-xs" onClick={() => setGenerating(true)}>
                  ✨ Generate with AI
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="flex flex-col">
                  <label htmlFor="tpl-body" className={labelClass}>HTML code</label>
                  <Textarea
                    id="tpl-body"
                    ref={bodyRef}
                    rows={20}
                    spellCheck={false}
                    className="min-h-[360px] flex-1 font-mono text-xs leading-relaxed"
                    placeholder={'<!DOCTYPE html>\n<html>\n  <body>\n    <p>Hi {{first_name|there}},</p>\n  </body>\n</html>'}
                    value={form.body}
                    onFocus={() => (lastFocused.current = "body")}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                  />
                  <p className={`mt-1 text-right text-[11px] ${tooBig ? "font-semibold text-red-600" : "text-gray-500"}`}>
                    {(bodyBytes / 1024).toFixed(1)} KB of 100 KB
                  </p>
                </div>
                <HtmlPreview html={previewHtml} />
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="tpl-body" className={labelClass}>Email body</label>
              <Textarea
                id="tpl-body"
                ref={bodyRef}
                rows={9}
                placeholder={"Hi {{first_name|there}},\n\n…\n\n{{signature}}"}
                value={form.body}
                onFocus={() => (lastFocused.current = "body")}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
              {looksLikeHtml(form.body) && (
                <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  This looks like HTML. Switch the format to “HTML design” so it is cleaned up, previewed and sent as a design.
                </p>
              )}
              {tooBig && <p className="mt-1 text-[11px] font-semibold text-red-600">The body is limited to 100 KB.</p>}
            </div>
          )}

          <VariablePicker profileFields={profileFields} onInsert={insert} />

          <div className="flex flex-col-reverse gap-2 border-t border-[#BAE6FD]/40 pt-3 sm:flex-row sm:justify-end dark:border-gray-800">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>Cancel</Button>
            <Button className="w-full sm:w-auto" onClick={() => save.mutate()} disabled={!canSave}>
              {save.isPending ? "Saving…" : "Save template"}
            </Button>
          </div>
        </div>
      </Modal>

      {generating && (
        <GenerateHtmlDialog
          onClose={() => setGenerating(false)}
          onGenerated={({ html, subject }) => {
            setForm((f) => ({ ...f, format: "html", body: html, subject: f.subject.trim() ? f.subject : subject ?? f.subject }));
            toast.success("Design ready — review it, then save");
          }}
        />
      )}
    </>
  );
}
