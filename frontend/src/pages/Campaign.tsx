import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    refetchInterval: 15000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["campaign-status"] });

  const start = useMutation({ mutationFn: campaignApi.start, onSuccess: () => { toast.success("Campaign started"); invalidate(); } });
  const pause = useMutation({ mutationFn: campaignApi.pause, onSuccess: () => { toast.info("Paused"); invalidate(); } });
  const resume = useMutation({ mutationFn: campaignApi.resume, onSuccess: () => { toast.success("Resumed"); invalidate(); } });
  const stop = useMutation({ mutationFn: campaignApi.stop, onSuccess: () => { toast.info("Stopped"); invalidate(); } });
  const setMode = useMutation({
    mutationFn: (m: CampaignMode) => campaignApi.setMode(m),
    onSuccess: () => { toast.success("Mode updated"); invalidate(); },
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="Failed to load campaign status." />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Campaign</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <div className="text-sm text-gray-500">State</div>
          <div className="mt-1 text-xl font-bold">{data.state}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Mode</div>
          <div className="mt-1 text-xl font-bold">{data.mode}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Quota Today</div>
          <div className="mt-1 text-xl font-bold">
            {data.quotaToday} / {data.dailyLimit}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Next Scheduled</div>
          <div className="mt-1 text-sm font-medium">
            {data.nextScheduledAt ? new Date(data.nextScheduledAt).toLocaleString() : "—"}
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-2 font-semibold">Mode</div>
        <div className="flex gap-2">
          {MODES.map((m) => (
            <Button
              key={m}
              variant={data.mode === m ? "primary" : "secondary"}
              onClick={() => setMode.mutate(m)}
            >
              {m}
            </Button>
          ))}
        </div>
        {data.mode === "LIVE" && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            ⚠️ LIVE mode sends real emails to real contacts (max {data.dailyLimit}/day).
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-2 font-semibold">Controls</div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => start.mutate()} disabled={data.state === "RUNNING"}>
            Start
          </Button>
          <Button
            variant="secondary"
            onClick={() => pause.mutate()}
            disabled={data.state !== "RUNNING"}
          >
            Pause
          </Button>
          <Button
            variant="secondary"
            onClick={() => resume.mutate()}
            disabled={data.state !== "PAUSED"}
          >
            Resume
          </Button>
          <Button variant="danger" onClick={() => stop.mutate()} disabled={data.state === "STOPPED" || data.state === "IDLE"}>
            Stop
          </Button>
        </div>
      </Card>
    </div>
  );
}
