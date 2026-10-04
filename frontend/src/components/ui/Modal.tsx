import type { ReactNode } from "react";

/**
 * Shared dialog shell. Lifted out of Templates.tsx when the Inbox Sorter needed a
 * third and fourth copy of it — the sizing, backdrop and close affordance should
 * only be defined once.
 */
export function Modal({
  title,
  children,
  onClose,
  maxWidth = "max-w-lg",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} rounded-2xl bg-[#F1F5F9] border border-[#BAE6FD] p-4 sm:p-6 shadow-2xl dark:bg-gray-900 dark:border-gray-800 max-h-[92vh] overflow-y-auto`}
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
