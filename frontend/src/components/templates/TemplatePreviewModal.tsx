import { Button } from "../ui/primitives";
import { Modal } from "../ui/Modal";
import type { TemplatePreview } from "../../types/api";
import { HtmlPreview } from "./HtmlPreview";

/** A saved template rendered by the server with sample values, the way it would be sent. */
export function TemplatePreviewModal({ preview, onClose }: { preview: TemplatePreview; onClose: () => void }) {
  const isHtml = preview.format === "html";
  return (
    <Modal onClose={onClose} title="Template preview (sample values)" maxWidth={isHtml ? "max-w-3xl" : "max-w-lg"}>
      <div className="space-y-3">
        <div className="rounded-lg bg-[#BAE6FD] border border-[#BAE6FD] p-3 text-sm dark:bg-gray-800 dark:border-transparent break-words">
          <div className="font-semibold text-gray-900 dark:text-gray-100">{preview.subject}</div>
        </div>
        {isHtml ? (
          <HtmlPreview html={preview.body} className="h-[60vh]" />
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-[#F1F5F9] border border-[#BAE6FD] p-3.5 sm:p-4 text-xs font-sans text-gray-800 leading-relaxed dark:bg-gray-800 dark:text-gray-200 dark:border-transparent max-h-60 overflow-y-auto">
            {preview.body}
          </pre>
        )}
        <p className="text-[11px] text-gray-600 dark:text-gray-400">
          Uses your profile and a sample contact. Spreadsheet columns show as {"{{column_name}}"} here and are filled per contact when sending.
        </p>
        <div className="flex justify-end pt-1">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
