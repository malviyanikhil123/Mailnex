import { useToast } from "../../store/toast";

const styles: Record<string, string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  info: "bg-brand-600",
};

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`${styles[t.kind]} max-w-sm rounded-lg px-4 py-3 text-left text-sm text-white shadow-lg`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
