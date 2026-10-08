import { useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignApi } from "../../services/campaign.api";
import { Button, Card } from "../ui/primitives";
import { toast } from "../../store/toast";
import type { Campaign, SenderAccount } from "../../types/api";

type Action = "start" | "pause" | "resume" | "stop";

const STATE_STYLES: Record<string, string> = {
  RUNNING: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  PAUSED: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  STOPPED: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  IDLE: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export function CampaignCard({
  campaign: c,
  senders,
  primaryEmail,
  onEdit,
}: {
  campaign: Campaign;
  senders: SenderAccount[];
  primaryEmail: string | null;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["campaigns"] });

  const act = useMutation({
    mutationFn: (a: Action) => campaignApi[a](c.id),
    onSuccess: (_d, a) => {
      toast.success(`Campaign ${a === "stop" ? "stopped" : a === "pause" ? "paused" : "running"}`);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, "Action failed")),
  });
  const remove = useMutation({
    mutationFn: () => campaignApi.remove(c.id),
    onSuccess: () => { toast.success("Campaign deleted"); invalidate(); },
    onError: (err) => toast.error(errorMessage(err, "Delete failed")),
  });

  const sender = c.senderAccountId ? senders.find((s) => s.id === c.senderAccountId) : null;
  const senderLabel = sender ? `${sender.label} (${sender.email})` : `Primary Gmail${primaryEmail ? ` (${primaryEmail})` : ""}`;
  const pending = c.countsByStatus.PENDING ?? 0;
  const sent = c.countsByStatus.SENT ?? 0;
  const busy = act.isPending || remove.isPending;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-gray-900 dark:text-gray-100">{c.name}</h2>
          <p className="truncate text-xs text-gray-500">
            {c.importName ?? "No import selected"} · {senderLabel}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_STYLES[c.state]}`}>{c.state}</span>
          <span className="rounded-full bg-[#BAE6FD] px-2 py-0.5 text-[11px] font-semibold text-gray-800 dark:bg-[#164549] dark:text-[#E3FDFD]">
            {c.mode}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Sent today" value={`${c.quotaToday} / ${c.dailyLimit}`} />
        <Stat label="Pending" value={pending} />
        <Stat label="Sent total" value={sent} />
        <Stat
          label="Next send"
          value={c.nextScheduledAt ? new Date(c.nextScheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
        />
      </div>

      <p className="text-xs text-gray-500">
        {c.templateIds.length} template{c.templateIds.length === 1 ? "" : "s"} · {c.language} ·{" "}
        {c.aiEnabled ? "AI enhanced" : "No AI"} · {c.startHour}:00–{c.endHour}:00
      </p>

      {c.mode === "LIVE" && c.state === "RUNNING" && (
        <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
          LIVE — sending real emails to this import.
        </p>
      )}
      {c.state === "RUNNING" && !c.nextScheduledAt && pending === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Running, but this import has no pending contacts left.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(c.state === "IDLE" || c.state === "STOPPED") && (
          <Button className="text-xs" disabled={busy} onClick={() => act.mutate("start")}>Start</Button>
        )}
        {c.state === "RUNNING" && (
          <Button variant="secondary" className="text-xs" disabled={busy} onClick={() => act.mutate("pause")}>Pause</Button>
        )}
        {c.state === "PAUSED" && (
          <Button className="text-xs" disabled={busy} onClick={() => act.mutate("resume")}>Resume</Button>
        )}
        {(c.state === "RUNNING" || c.state === "PAUSED") && (
          <Button variant="danger" className="text-xs" disabled={busy} onClick={() => act.mutate("stop")}>Stop</Button>
        )}
        <Button variant="secondary" className="text-xs" disabled={busy} onClick={onEdit}>Edit</Button>
        {c.state !== "RUNNING" && (
          <button
            className="ml-auto text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
            disabled={busy}
            onClick={() => confirm(`Delete campaign "${c.name}"? Its contacts and logs are kept.`) && remove.mutate()}
          >
            Delete
          </button>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/60 px-2.5 py-1.5 dark:bg-gray-900/40">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}
