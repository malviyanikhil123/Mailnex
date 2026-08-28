import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="mx-3 mb-3 rounded-xl border border-[#A6E3E9] bg-gradient-to-r from-[#E3FDFD] to-[#CBF1F5] p-3 shadow-xs dark:border-[#164549] dark:from-[#0e2124] dark:to-[#14363b]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-[#71C9CE] to-[#36888e] text-white font-bold text-xs shrink-0">
            M
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900 dark:text-gray-100">Install Mailnex App</div>
            <div className="text-[11px] text-gray-600 dark:text-gray-300">Install on your phone for quick access</div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Dismiss banner"
        >
          <X size={14} />
        </button>
      </div>
      <button
        onClick={install}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#71C9CE] hover:bg-[#51b2b8] py-1.5 text-xs font-bold text-gray-950 shadow-xs transition"
      >
        <Download size={14} /> Install App
      </button>
    </div>
  );
}
