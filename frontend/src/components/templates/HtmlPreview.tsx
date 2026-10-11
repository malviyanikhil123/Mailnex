import { useMemo, useState } from "react";
import { safePreviewHtml } from "./variables";

type Width = "desktop" | "mobile";

const WIDTHS: Record<Width, string> = { desktop: "100%", mobile: "375px" };

/**
 * Renders email HTML in a fully sandboxed iframe: sandbox="" (no scripts, no same
 * origin, no forms or popups) on top of DOMPurify, with a desktop / mobile width toggle.
 */
export function HtmlPreview({
  html,
  className = "",
  label = "Preview (sample values)",
}: {
  html: string;
  className?: string;
  label?: string;
}) {
  const [width, setWidth] = useState<Width>("desktop");
  const srcDoc = useMemo(() => safePreviewHtml(html), [html]);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <div role="group" aria-label="Preview width" className="inline-flex rounded-md border border-[#BAE6FD] text-[11px] dark:border-[#164549]">
          {(Object.keys(WIDTHS) as Width[]).map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={width === w}
              onClick={() => setWidth(w)}
              className={`px-2 py-0.5 capitalize first:rounded-l-md last:rounded-r-md ${
                width === w
                  ? "bg-[#60A5FA] text-white dark:bg-[#71C9CE] dark:text-gray-950"
                  : "text-gray-700 hover:bg-[#E0F2FE] dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-1 justify-center overflow-auto rounded-lg border border-[#BAE6FD] bg-white p-1 dark:border-[#164549]">
        <iframe
          title="Email preview"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          style={{ width: WIDTHS[width] }}
          className="h-full min-h-[360px] max-w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
