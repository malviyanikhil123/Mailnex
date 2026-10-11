import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { contactsApi } from "../../services/contacts.api";
import { templatesApi } from "../../services/templates.api";
import { sendersApi } from "../../services/senders.api";
import { settingsApi } from "../../services/settings.api";
import { aiApi } from "../../services/ai.api";
import { Button, Input, Labeled, Textarea, selectClass } from "../ui/primitives";
import type { AiProviderId, Campaign, CampaignInput, CampaignMode } from "../../types/api";

const MODES: CampaignMode[] = ["DRAFT", "TEST", "LIVE"];
const LANGUAGES = ["English", "Hindi", "Spanish", "French", "German", "Portuguese", "Arabic", "Japanese"];

const EMPTY: CampaignInput = {
  name: "",
  importId: null,
  senderAccountId: null,
  templateIds: [],
  mode: "DRAFT",
  dailyLimit: 50,
  startHour: 9,
  endHour: 18,
  testEmail: null,
  language: "English",
  aiEnabled: true,
  aiInstructions: null,
  aiProvider: null,
  aiModel: null,
};

/** Create/edit form: the three parameters that define a campaign are the import it
 *  sends to, the templates it rotates through, and the sender / AI / language setup. */
export function CampaignForm({
  initial,
  saving,
  onSubmit,
  onCancel,
}: {
  initial?: Campaign;
  saving: boolean;
  onSubmit: (input: CampaignInput) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<CampaignInput>(() => (initial ? pickInput(initial) : EMPTY));
  const set = <K extends keyof CampaignInput>(k: K, val: CampaignInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const locked = initial?.state === "RUNNING" || initial?.state === "PAUSED";

  const imports = useQuery({ queryKey: ["imports"], queryFn: contactsApi.imports });
  const templates = useQuery({ queryKey: ["templates"], queryFn: templatesApi.list });
  const senders = useQuery({ queryKey: ["senders"], queryFn: sendersApi.list });
  const settings = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
  const aiProviders = useQuery({ queryKey: ["ai-providers"], queryFn: aiApi.list });
  const connectedAi = aiProviders.data?.filter((p) => p.configured) ?? [];
  const defaultAi = connectedAi.find((p) => p.isDefault);
  const chosenAi = connectedAi.find((p) => p.provider === v.aiProvider);
  // Curated models plus the provider's saved one when it is a custom id.
  const chosenModels = chosenAi
    ? chosenAi.models.includes(chosenAi.defaultModel) ? chosenAi.models : [...chosenAi.models, chosenAi.defaultModel]
    : [];

  const selectedHtml = templates.data?.filter((t) => t.format === "html" && v.templateIds.includes(t.id)).length ?? 0;

  const toggleTemplate = (id: number) =>
    set("templateIds", v.templateIds.includes(id) ? v.templateIds.filter((t) => t !== id) : [...v.templateIds, id]);

  const windowInvalid = v.startHour >= v.endHour;
  const canSave = v.name.trim() && !windowInvalid && !(v.mode === "TEST" && !v.testEmail);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSubmit({ ...v, aiInstructions: v.aiInstructions?.trim() || null, testEmail: v.testEmail?.trim() || null });
      }}
    >
      <Labeled label="Campaign name">
        <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Diwali promo — client A" autoFocus />
      </Labeled>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Labeled label="Import (who receives it)">
          <select
            className={selectClass}
            value={v.importId ?? ""}
            disabled={locked}
            onChange={(e) => set("importId", e.target.value ? +e.target.value : null)}
          >
            <option value="">Select an import…</option>
            {imports.data?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name || i.fileName} · {i.pendingCount ?? 0} pending
              </option>
            ))}
          </select>
          {locked && <Hint>Stop the campaign to switch imports.</Hint>}
        </Labeled>

        <Labeled label="Send from">
          <select
            className={selectClass}
            value={v.senderAccountId ?? ""}
            onChange={(e) => set("senderAccountId", e.target.value ? +e.target.value : null)}
          >
            <option value="">
              Primary Gmail{settings.data?.gmailEmail ? ` (${settings.data.gmailEmail})` : ""}
            </option>
            {senders.data?.filter((s) => s.active || s.id === v.senderAccountId).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.email})
              </option>
            ))}
          </select>
        </Labeled>
      </div>

      <Labeled label={`Templates to rotate (${v.templateIds.length} selected)`}>
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-[#BAE6FD] p-2 dark:border-[#164549]">
          {templates.data?.length === 0 && <Hint>No templates yet — create some on the Templates page.</Hint>}
          {templates.data?.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[#E0F2FE] dark:hover:bg-gray-800/40">
              <input type="checkbox" checked={v.templateIds.includes(t.id)} onChange={() => toggleTemplate(t.id)} />
              <span className="truncate">{t.name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-gray-500">{t.category}{t.format === "html" ? " · HTML" : ""}</span>
            </label>
          ))}
        </div>
        <Hint>Contacts already emailed get "followup" templates first; new contacts never do.</Hint>
      </Labeled>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Labeled label="Mode">
          <select className={selectClass} value={v.mode} onChange={(e) => set("mode", e.target.value as CampaignMode)}>
            {MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Labeled>
        <Labeled label="Daily limit">
          <Input type="number" min={1} value={v.dailyLimit} onChange={(e) => set("dailyLimit", +e.target.value)} />
        </Labeled>
        <Labeled label="Start hour">
          <Input type="number" min={0} max={23} value={v.startHour} onChange={(e) => set("startHour", +e.target.value)} />
        </Labeled>
        <Labeled label="End hour">
          <Input type="number" min={1} max={24} value={v.endHour} onChange={(e) => set("endHour", +e.target.value)} />
        </Labeled>
      </div>
      {windowInvalid && <p className="text-xs text-red-600">Start hour must be before end hour.</p>}

      {v.mode === "TEST" && (
        <Labeled label="Test email (TEST mode sends here instead of the contacts)">
          <Input value={v.testEmail ?? ""} onChange={(e) => set("testEmail", e.target.value)} placeholder="you@example.com" />
        </Labeled>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Labeled label="Language">
          <Input list="campaign-languages" value={v.language} onChange={(e) => set("language", e.target.value)} />
          <datalist id="campaign-languages">
            {LANGUAGES.map((l) => <option key={l} value={l} />)}
          </datalist>
        </Labeled>
        <Labeled label="AI enhancement">
          <label className="flex h-[38px] items-center gap-2 text-sm">
            <input type="checkbox" checked={v.aiEnabled} onChange={(e) => set("aiEnabled", e.target.checked)} />
            Personalize each email with AI
          </label>
        </Labeled>
      </div>
      {!v.aiEnabled && v.language !== "English" && (
        <Hint>Without AI the template is sent as written — write it in {v.language || "the target language"}.</Hint>
      )}
      {v.aiEnabled && selectedHtml > 0 && (
        <Hint>
          AI personalization applies to plain-text templates; the {selectedHtml} HTML design{selectedHtml === 1 ? "" : "s"} selected
          {selectedHtml === 1 ? " is" : " are"} sent as designed.
        </Hint>
      )}

      {v.aiEnabled && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="AI provider">
            <select
              className={selectClass}
              value={v.aiProvider ?? ""}
              onChange={(e) => setV((p) => ({ ...p, aiProvider: (e.target.value || null) as AiProviderId | null, aiModel: null }))}
            >
              <option value="">Default{defaultAi ? ` (${defaultAi.label})` : ""}</option>
              {connectedAi.map((p) => (
                <option key={p.provider} value={p.provider}>{p.label}</option>
              ))}
              {v.aiProvider && !chosenAi && <option value={v.aiProvider}>{v.aiProvider} (not connected)</option>}
            </select>
            {aiProviders.isSuccess && connectedAi.length === 0 && (
              <Hint>No AI provider connected — emails go out as written until you add an API key in Settings.</Hint>
            )}
          </Labeled>
          <Labeled label="Model">
            <select
              className={selectClass}
              value={v.aiModel ?? ""}
              disabled={!chosenAi}
              onChange={(e) => set("aiModel", e.target.value || null)}
            >
              <option value="">
                {chosenAi ? `Provider default (${chosenAi.defaultModel})` : `Default${defaultAi ? ` (${defaultAi.defaultModel})` : ""}`}
              </option>
              {chosenModels.map((m) => <option key={m} value={m}>{m}</option>)}
              {v.aiModel && !chosenModels.includes(v.aiModel) && <option value={v.aiModel}>{v.aiModel}</option>}
            </select>
          </Labeled>
        </div>
      )}

      {v.aiEnabled && (
        <Labeled label="AI instructions (optional)">
          <Textarea
            rows={3}
            value={v.aiInstructions ?? ""}
            onChange={(e) => set("aiInstructions", e.target.value)}
            placeholder="e.g. Friendly tone, mention the 20% launch offer, keep it under 120 words."
          />
        </Labeled>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving || !canSave}>{saving ? "Saving…" : initial ? "Save changes" : "Create campaign"}</Button>
      </div>
    </form>
  );
}

function pickInput(c: Campaign): CampaignInput {
  const { name, importId, senderAccountId, templateIds, mode, dailyLimit, startHour, endHour, testEmail, language, aiEnabled, aiInstructions, aiProvider, aiModel } = c;
  return { name, importId, senderAccountId, templateIds, mode, dailyLimit, startHour, endHour, testEmail, language, aiEnabled, aiInstructions, aiProvider, aiModel };
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-gray-500">{children}</p>;
}
