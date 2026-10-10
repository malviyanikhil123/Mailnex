import { useMemo } from "react";
import { Button, Card } from "../ui/primitives";
import type { Template } from "../../types/api";
import { categoryLabel } from "./TemplateEditor";

/** Visible text of an HTML design, for the card excerpt (DOMParser never runs scripts or loads images). */
function textOf(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, title").forEach((el) => el.remove());
  return (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
}

const badgeClass =
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border";

export function TemplateCard({
  template: t,
  onPreview,
  onEdit,
  onDelete,
}: {
  template: Template;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const excerpt = useMemo(() => (t.format === "html" ? textOf(t.body) : t.body), [t.format, t.body]);

  return (
    <Card className="flex flex-col">
      <div className="min-w-0">
        <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{t.name}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">{categoryLabel(t.category)}</span>
          <span>•</span>
          <span>v{t.version}</span>
          <span>•</span>
          {t.format === "html" ? (
            <span className={`${badgeClass} bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-transparent`}>
              HTML design
            </span>
          ) : (
            <span className={`${badgeClass} bg-white text-gray-700 border-[#BAE6FD] dark:bg-gray-900 dark:text-gray-300 dark:border-transparent`}>
              Plain text
            </span>
          )}
          {t.document ? (
            <span className={`${badgeClass} bg-[#BAE6FD] text-[#0F172A] border-[#7dd3fc] dark:bg-[#164549] dark:text-[#E3FDFD] dark:border-transparent`}>
              📄 {t.document.name}
            </span>
          ) : (
            <span className="text-[11px] text-gray-500">No attachment</span>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-[#F1F5F9] border border-[#BAE6FD]/60 p-2.5 text-xs font-medium text-gray-800 dark:bg-[#122b2f]/60 dark:text-gray-200 dark:border-transparent break-words">
        <span className="text-gray-500 dark:text-gray-500">Subject: </span>
        {t.subject}
      </div>

      <p className="mt-2.5 mb-4 line-clamp-3text-xs leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
        {excerpt}
      </p>

      <div className="mt-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 border-t border-[#BAE6FD]/60 pt-3 dark:border-[#164549]">
        <Button variant="secondary" className="text-xs py-1.5 px-2.5" onClick={onPreview}>Preview</Button>
        <Button variant="secondary" className="text-xs py-1.5 px-2.5" onClick={onEdit}>Edit</Button>
        <Button variant="danger" className="text-xs py-1.5 px-2.5" onClick={onDelete}>Delete</Button>
      </div>
    </Card>
  );
}
