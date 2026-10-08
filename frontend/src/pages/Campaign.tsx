import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignApi } from "../services/campaign.api";
import { sendersApi } from "../services/senders.api";
import { settingsApi } from "../services/settings.api";
import { Button, Card, Spinner, ErrorState } from "../components/ui/primitives";
import { Modal } from "../components/ui/Modal";
import { CampaignCard } from "../components/campaign/CampaignCard";
import { CampaignForm } from "../components/campaign/CampaignForm";
import { toast } from "../store/toast";
import type { Campaign as CampaignRow, CampaignInput } from "../types/api";

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export default function Campaign() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CampaignRow | "new" | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignApi.list,
    refetchInterval: 10000,
  });
  const senders = useQuery({ queryKey: ["senders"], queryFn: sendersApi.list });
  const settings = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });

  const save = useMutation({
    mutationFn: (input: CampaignInput) =>
      editing && editing !== "new" ? campaignApi.update(editing.id, input) : campaignApi.create(input),
    onSuccess: () => {
      toast.success(editing === "new" ? "Campaign created" : "Campaign saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err) => toast.error(errorMessage(err, "Save failed")),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="Failed to load campaigns." />;

  const running = data.filter((c) => c.state === "RUNNING").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-gray-500">
            Run several campaigns at once — each with its own import, templates, sender, language and AI setup.
            {running > 0 && ` ${running} running.`}
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>+ New campaign</Button>
      </div>

      {data.length === 0 ? (
        <Card className="py-10 text-center text-sm text-gray-500">
          No campaigns yet. Import contacts, pick templates, then create your first campaign.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              senders={senders.data ?? []}
              primaryEmail={settings.data?.gmailEmail ?? null}
              onEdit={() => setEditing(c)}
            />
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? "New campaign" : `Edit "${editing.name}"`}
          onClose={() => setEditing(null)}
          maxWidth="max-w-2xl"
        >
          <CampaignForm
            initial={editing === "new" ? undefined : editing}
            saving={save.isPending}
            onSubmit={(input) => save.mutate(input)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
