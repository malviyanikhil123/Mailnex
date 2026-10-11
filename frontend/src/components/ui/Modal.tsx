import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Open dialogs, innermost last: only that one answers Escape and keeps Tab inside. */
const openDialogs: symbol[] = [];

/**
 * Shared dialog shell. Lifted out of Templates.tsx when the Inbox Sorter needed a
 * third and fourth copy of it — the sizing, backdrop and close affordance should
 * only be defined once.
 *
 * A dialog for screen readers (role, label), closed with Escape, the ✕ or a click on the
 * backdrop; Tab stays inside while it is open and focus goes back to the opener after.
 * Editors pass `confirmClose` while they have unsaved changes: Escape, ✕ and the backdrop
 * then ask before throwing the changes away.
 */
export function Modal({
  title,
  children,
  onClose,
  maxWidth = "max-w-lg",
  confirmClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
  /** Question asked before Escape / ✕ / backdrop close the dialog; unset = close at once. */
  confirmClose?: string | false | null;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest props for the listeners registered once on mount.
  const latest = useRef({ onClose, confirmClose });
  latest.current = { onClose, confirmClose };
  // Where the press started: a text selection dragged out onto the backdrop is not a click on it.
  const pressedBackdrop = useRef(false);

  const requestClose = () => {
    const { onClose: close, confirmClose: question } = latest.current;
    if (question && !window.confirm(question)) return;
    close();
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    const id = Symbol("dialog");
    openDialogs.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // Leave focus where an autoFocus field put it; otherwise start on the dialog itself.
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== id || !panel) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        requestCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.closest("[inert]") && el.getAttribute("aria-hidden") !== "true",
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      const inside = panel.contains(active);
      if (e.shiftKey && (active === first || active === panel || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const at = openDialogs.indexOf(id);
      if (at !== -1) openDialogs.splice(at, 1);
      // Back to the button that opened the dialog, unless the page moved focus elsewhere.
      const focusLost = !document.activeElement || document.activeElement === document.body || panel?.contains(document.activeElement);
      if (opener?.isConnected && focusLost) opener.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) requestClose();
        pressedBackdrop.current = false;
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidth} rounded-2xl bg-[#F1F5F9] border border-[#BAE6FD] p-4 sm:p-6 shadow-2xl outline-none dark:bg-gray-900 dark:border-gray-800 max-h-[92vh] overflow-y-auto`}
      >
        <div className="mb-3.5 flex items-center justify-between">
          <h2 id={titleId} className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
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
