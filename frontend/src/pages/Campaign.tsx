import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { campaignApi } from "../services/campaign.api";
import { Button, Card, Spinner, ErrorState } from "../components/ui/primitives";
import { toast } from "../store/toast";
import type { CampaignMode } from "../types/api";

const MODES: CampaignMode[] = ["DRAFT", "TEST", "LIVE"];

export default function Campaign() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["campaign-status"],
    queryFn: campaignApi.status,
    refetchInterval: 10000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["campaign-status"] });

  const start = useMutation({
    mutationFn: campaignApi.start,
    onSuccess: () => {
      toast.success("Campaign started");
      invalidate();
    },
  });
  const pause = useMutation({
    mutationFn: campaignApi.pause,
    onSuccess: () => {
      toast.info("Paused");
      invalidate();
    },
  });
  const resume = useMutation({
    mutationFn: campaignApi.resume,
    onSuccess: () => {
      toast.success("Resumed");
      invalidate();
    },
  });
  const stop = useMutation({
    mutationFn: campaignApi.stop,
    onSuccess: () => {
      toast.info("Stopped");
      invalidate();
    },
  });
  const setMode = useMutation({
    mutationFn: (m: CampaignMode) => campaignApi.setMode(m),
    onSuccess: () => {
      toast.success("Mode updated");
      invalidate();
    },
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="Failed to load campaign status." />;

  const pendingCount = data.countsByStatus?.PENDING ?? 0;
  const isRunning = data.state === "RUNNING";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Campaign</h1>
        <p className="text-sm text-gray-500">Manage campaign execution state, modes, and sending schedule.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Card>
          <div className="text-xs sm:text-sm text-gray-500">State</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">{data.state}</div>
        </Card>
        <Card>
          <div className="text-xs sm:text-sm text-gray-500">Mode</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-[#0F172A] dark:text-[#71C9CE]">{data.mode}</div>
        </Card>
        <Card>
          <div className="text-xs sm:text-sm text-gray-500">Quota Today</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
            {data.quotaToday} / {data.dailyLimit}
          </div>
        </Card>
        <Card>
          <div className="text-xs sm:text-sm text-gray-500">Next Scheduled</div>
          <div className="mt-1 text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
            {data.nextScheduledAt ? new Date(data.nextScheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}
          </div>
        </Card>
      </div>

      {/* Intelligent Status Helper Banner */}
      {isRunning && !data.nextScheduledAt && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="font-semibold text-amber-950 dark:text-amber-100 mb-1 flex items-center gap-1.5">
            <span>ℹ️</span> Campaign is RUNNING, but no emails are currently queued:
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-amber-800 dark:text-amber-300">
            {pendingCount === 0 && (
              <li>
                <strong>0 Pending Contacts:</strong> All your current contacts have already been processed (sent or bounced). Go to{" "}
                <Link to="/contacts" className="font-bold underline text-amber-900 dark:text-amber-100">
                  Contacts
                </Link>{" "}
                and import an Excel list or add new contacts.
              </li>
            )}
            <li>
              <strong>Template Selection:</strong> Ensure at least 1 template is checked in{" "}
              <Link to="/templates" className="font-bold underline text-amber-900 dark:text-amber-100">
                Templates
              </Link>
              .
            </li>
          </ul>
        </div>
      )}

      <Card>
        <div className="mb-2 font-semibold text-sm sm:text-base">Mode</div>
        <div className="flex gap-2">
          {MODES.map((m) => (
            <Button
              key={m}
              variant={data.mode === m ? "primary" : "secondary"}
              onClick={() => setMode.mutate(m)}
              className="text-xs sm:text-sm"
            >
              {m}
            </Button>
          ))}
        </div>
        {data.mode === "LIVE" && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs sm:text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            ⚠️ LIVE mode sends real emails to real contacts (max {data.dailyLimit}/day).
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-2 font-semibold text-sm sm:text-base">Controls</div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => start.mutate()} disabled={data.state === "RUNNING"} className="text-xs sm:text-sm">
            Start
          </Button>
          <Button
            variant="secondary"
            onClick={() => pause.mutate()}
            disabled={data.state !== "RUNNING"}
            className="text-xs sm:text-sm"
          >
            Pause
          </Button>
          <Button
            variant="secondary"
            onClick={() => resume.mutate()}
            disabled={data.state !== "PAUSED"}
            className="text-xs sm:text-sm"
          >
            Resume
          </Button>
          <Button
            variant="danger"
            onClick={() => stop.mutate()}
            disabled={data.state === "STOPPED" || data.state === "IDLE"}
            className="text-xs sm:text-sm"
          >
            Stop
          </Button>
        </div>
      </Card>
    </div>
  );
}
