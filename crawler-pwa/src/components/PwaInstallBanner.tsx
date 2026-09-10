import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const installPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  if (!showBanner) return null;

  return (
    <div className="mx-3 my-2 p-3 bg-blue-50 dark:bg-[#12282c] border border-[#BAE6FD] dark:border-[#164549] rounded-xl flex items-center justify-between gap-2 shadow-xs">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60A5FA] text-white">
          <Download size={14} />
        </div>
        <div className="text-xs">
          <p className="font-bold text-[#0F172A] dark:text-gray-100">Install Crawler App</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Add to home screen</p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={installPwa}
          className="px-2.5 py-1 bg-[#60A5FA] text-white text-xs font-semibold rounded-md hover:bg-[#3B82F6] transition cursor-pointer"
        >
          Install
        </button>
        <button
          onClick={() => setShowBanner(false)}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
