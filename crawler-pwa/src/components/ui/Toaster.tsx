import { useToastStore } from "../../store/toast.js";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export function Toaster() {
  const { toasts, remove } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl p-3.5 shadow-lg border backdrop-blur-md transition-all duration-300 animate-fadeIn ${
            t.type === "success"
              ? "bg-emerald-50/95 border-emerald-300 text-emerald-900 dark:bg-[#06241a]/95 dark:border-emerald-800 dark:text-emerald-200"
              : t.type === "error"
              ? "bg-red-50/95 border-red-300 text-red-900 dark:bg-[#280808]/95 dark:border-red-800 dark:text-red-200"
              : "bg-blue-50/95 border-blue-300 text-blue-900 dark:bg-[#091a2e]/95 dark:border-blue-800 dark:text-blue-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {t.type === "success" && <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
            {t.type === "error" && <AlertCircle size={18} className="text-red-600 dark:text-red-400 shrink-0" />}
            {t.type === "info" && <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />}
            <p className="text-xs font-semibold leading-relaxed">{t.message}</p>
          </div>
          <button
            onClick={() => remove(t.id)}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
