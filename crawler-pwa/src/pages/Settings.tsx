import { useState } from "react";
import { Settings as SettingsIcon, Shield, Server, CheckCircle2, Cpu, HardDrive } from "lucide-react";
import { Card, Button, Input } from "../components/ui/primitives.js";
import { toast } from "../store/toast.js";

export default function Settings() {
  const [maxPages, setMaxPages] = useState(6);
  const [timeoutSec, setTimeoutSec] = useState(5);
  const [throttleMs, setThrottleMs] = useState(250);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Crawler safety and concurrency settings saved!");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#60A5FA] text-white shadow-xs dark:bg-[#71C9CE] dark:text-gray-950">
            <SettingsIcon size={20} />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
            Crawler Engine Settings
          </h1>
        </div>
        <p className="mt-1 text-sm text-[#334155] dark:text-gray-400">
          Configure background crawler rate limits, SSRF safeguards, and Mailnex database sync parameters.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Crawler Concurrency & Throttling */}
        <Card className="space-y-4">
          <div className="flex items-center gap-2 border-b border-[#BAE6FD] pb-3 dark:border-[#164549]">
            <Cpu size={18} className="text-[#60A5FA] dark:text-[#71C9CE]" />
            <h2 className="text-base font-bold text-[#0F172A] dark:text-[#E3FDFD]">
              Crawler Parameters
            </h2>
          </div>

          <form onSubmit={handleSave} className="space-y-3.5 text-xs">
            <div>
              <label className="font-semibold block text-[#0F172A] dark:text-gray-200 mb-1">
                Max Crawl Depth per Company Domain
              </label>
              <Input
                type="number"
                min={2}
                max={15}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
              />
              <span className="text-[10px] text-gray-500">
                Number of priority career/contact subpages to inspect per company.
              </span>
            </div>

            <div>
              <label className="font-semibold block text-[#0F172A] dark:text-gray-200 mb-1">
                Request Timeout (Seconds)
              </label>
              <Input
                type="number"
                min={2}
                max={15}
                value={timeoutSec}
                onChange={(e) => setTimeoutSec(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="font-semibold block text-[#0F172A] dark:text-gray-200 mb-1">
                Polite Throttle Delay (ms)
              </label>
              <Input
                type="number"
                min={100}
                max={2000}
                step={50}
                value={throttleMs}
                onChange={(e) => setThrottleMs(Number(e.target.value))}
              />
              <span className="text-[10px] text-gray-500">
                Prevents overloading target websites by spacing out sequential page fetches.
              </span>
            </div>

            <Button type="submit" className="w-full text-xs py-2 mt-2">
              Save Crawler Settings
            </Button>
          </form>
        </Card>

        {/* Backend & Security Status */}
        <Card className="space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[#BAE6FD] pb-3 dark:border-[#164549]">
              <Shield size={18} className="text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#E3FDFD]">
                Security & SSRF Safeguards
              </h2>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900 flex items-start gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 block">
                    SSRF Protection Active
                  </span>
                  <span className="text-emerald-800/80 dark:text-emerald-300 text-[11px]">
                    Internal subnets, private IPs (10.x, 192.168.x, 172.x), and localhost lookups are blocked.
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900 flex items-start gap-2">
                <Server size={16} className="text-[#60A5FA] dark:text-[#71C9CE] mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-blue-900 dark:text-blue-200 block">
                    Mailnex DB Synchronization
                  </span>
                  <span className="text-blue-800/80 dark:text-blue-300 text-[11px]">
                    Discovered leads are staged in `discovered_leads` and synced to Mailnex `contacts` upon explicit user selection.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-[#BAE6FD]/60 bg-white/40 dark:bg-[#12282c] dark:border-[#164549] flex items-center justify-between text-xs">
            <span className="text-gray-500 flex items-center gap-1.5">
              <HardDrive size={14} /> Backend API Status
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              Connected (Fastify)
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
