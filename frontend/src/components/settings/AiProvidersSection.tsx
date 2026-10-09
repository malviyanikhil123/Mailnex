import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { aiApi } from "../../services/ai.api";
import { Button, Card, Input } from "../ui/primitives";
import { toast } from "../../store/toast";
import type { AiProviderId, AiProviderStatus } from "../../types/api";
import { errorMessage, SectionHeader } from "./shared";

// ---------------------------------------------------------------------------
// Key format checks — mirror backend/src/integrations/ai/providers.ts so an obvious
// paste mistake is caught before the server's live check.
// ---------------------------------------------------------------------------

const KEY_RULES: Record<AiProviderId, { label: string; pattern: RegExp; min: number; max: number; hint: string }> = {
  openai: { label: "OpenAI", pattern: /^sk-[A-Za-z0-9_-]+$/, min: 20, max: 300, hint: 'OpenAI keys start with "sk-"' },
  anthropic: { label: "Anthropic Claude", pattern: /^sk-ant-[A-Za-z0-9_-]+$/, min: 40, max: 300, hint: 'Anthropic keys start with "sk-ant-"' },
  google: { label: "Google Gemini", pattern: /^AIza[A-Za-z0-9_-]{35}$/, min: 39, max: 39, hint: 'Google AI Studio keys start with "AIza" and are 39 characters long' },
  groq: { label: "Groq", pattern: /^gsk_[A-Za-z0-9]+$/, min: 40, max: 200, hint: 'Groq keys start with "gsk_"' },
};

/** Same rule as the server: letters, digits and . _ : / - only, and no "..". */
export const MODEL_ID_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

function guessProvider(key: string): AiProviderId | null {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-")) return "openai";
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("gsk_")) return "groq";
  return null;
}

/** A friendly problem with the pasted key, or null when it looks right. */
export function apiKeyProblem(provider: AiProviderId, raw: string): string | null {
  const key = raw.trim();
  const rule = KEY_RULES[provider];
  if (!key) return "Paste an API key";
  if (/\s/.test(key)) return "The key must not contain spaces or line breaks";
  const guessed = guessProvider(key);
  if (guessed && guessed !== provider) return `This looks like a key for ${KEY_RULES[guessed].label} — ${rule.hint}`;
  if (!rule.pattern.test(key)) return rule.hint;
  if (key.length < rule.min || key.length > rule.max) {
    return rule.min === rule.max
      ? rule.hint
      : `${rule.label} keys are ${rule.min}–${rule.max} characters long — check that you copied the whole key`;
  }
  return null;
}

const CUSTOM = "__custom__";

const selectClass =
  "w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100";

/** API keys for the AI providers that personalize campaign emails and sort the inbox.
 *  Keys are write-only: format-checked here, checked live with the provider by the
 *  server, stored encrypted, and never shown again (only their last 4 characters). */
export function AiProvidersSection({ onSaved }: { onSaved: () => void }) {
  const qc = useQueryClient();
  const { data: providers = [], isLoading } = useQuery({ queryKey: ["ai-providers"], queryFn: aiApi.list });
  const connected = providers.filter((p) => p.configured).length;

  const onChanged = (next: AiProviderStatus[]) => {
    qc.setQueryData(["ai-providers"], next);
    onSaved();
  };

  return (
    <Card>
      <SectionHeader title="AI providers" badge={connected ? `${connected} connected` : "Not configured"} />
      <p className="mb-3 text-xs text-gray-500">
        AI personalizes campaign emails and sorts your inbox, using your own API key. Connect one or more providers; the
        default one sorts the inbox and serves every campaign that does not pick its own. Keys are checked with the
        provider, stored encrypted, and never shown again.
      </p>
      {isLoading && <p className="text-xs text-gray-500">Loading…</p>}
      <div className="space-y-2">
        {providers.map((p) => (
          <ProviderRow key={p.provider} p={p} onChanged={onChanged} />
        ))}
      </div>
    </Card>
  );
}

function ProviderRow({ p, onChanged }: { p: AiProviderStatus; onChanged: (next: AiProviderStatus[]) => void }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [model, setModel] = useState(p.defaultModel);
  const [custom, setCustom] = useState(!p.models.includes(p.defaultModel));
  // Keyed on the values, not the array, so a background refetch keeps an unsaved pick.
  const modelsKey = p.models.join("|");
  useEffect(() => {
    setModel(p.defaultModel);
    setCustom(!modelsKey.split("|").includes(p.defaultModel));
  }, [p.defaultModel, modelsKey]);

  const keyProblem = key ? apiKeyProblem(p.provider, key) : null;
  const modelProblem = custom && !MODEL_ID_PATTERN.test(model.trim()) ? "Enter a model id (letters, digits, . _ : / -)" : null;
  const modelChanged = model.trim() !== p.defaultModel;
  const canSave = !keyProblem && !modelProblem && (key ? true : p.configured && modelChanged);

  const save = useMutation({
    mutationFn: () =>
      aiApi.save(p.provider, {
        ...(key ? { apiKey: key.trim() } : {}),
        ...(modelChanged || !p.configured ? { defaultModel: model.trim() } : {}),
      }),
    onSuccess: (next) => {
      toast.success(key ? `${p.label} key verified and saved` : `${p.label} model saved`);
      setKey("");
      onChanged(next);
    },
    onError: (err) => toast.error(errorMessage(err, `Could not save the ${p.label} key`)),
  });
  const makeDefault = useMutation({
    mutationFn: () => aiApi.setDefault(p.provider),
    onSuccess: (next) => { toast.success(`${p.label} is now the default`); onChanged(next); },
    onError: (err) => toast.error(errorMessage(err, "Update failed")),
  });
  const remove = useMutation({
    mutationFn: () => aiApi.remove(p.provider),
    onSuccess: (next) => {
      toast.success(`${p.label} key removed`);
      onChanged(next);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err) => toast.error(errorMessage(err, "Delete failed")),
  });

  const status = !p.configured
    ? "Not connected"
    : `Connected${p.keyLast4 ? ` · key …${p.keyLast4}` : ""}`;

  return (
    <div className="rounded-lg border border-[#BAE6FD]/70 p-3 text-sm dark:border-gray-800" data-testid={`ai-provider-${p.provider}`}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{p.label}</span>
        {p.isDefault && (
          <span className="rounded bg-[#E0F2FE] px-1.5 py-0.5 text-[11px] font-medium text-[#1D4ED8] dark:bg-[#164549] dark:text-[#E3FDFD]">
            Default
          </span>
        )}
        <span className="text-xs text-gray-500">{status}</span>
        <a
          href={p.keyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs font-medium text-[#3B82F6] hover:underline"
        >
          Get an API key ↗
        </a>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_14rem]">
        <div>
          <Input
            type="password"
            autoComplete="new-password"
            aria-label={`${p.label} API key`}
            placeholder={p.configured ? `New key to replace …${p.keyLast4 ?? ""} (write-only)` : `${p.label} API key (write-only)`}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          {keyProblem && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{keyProblem}</p>}
        </div>
        <div>
          <select
            className={selectClass}
            aria-label={`${p.label} model`}
            value={custom ? CUSTOM : model}
            onChange={(e) => {
              if (e.target.value === CUSTOM) {
                setCustom(true);
                setModel(p.models.includes(p.defaultModel) ? "" : p.defaultModel);
              } else {
                setCustom(false);
                setModel(e.target.value);
              }
            }}
          >
            {p.models.map((m, i) => (
              <option key={m} value={m}>{i === 0 ? `${m} (recommended)` : m}</option>
            ))}
            <option value={CUSTOM}>Custom model id…</option>
          </select>
          {custom && (
            <Input
              className="mt-2"
              aria-label={`${p.label} custom model id`}
              placeholder="e.g. a newer model id"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          )}
          {modelProblem && model && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{modelProblem}</p>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button className="text-xs" onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
          {save.isPending ? `Checking with ${p.label}…` : p.configured ? "Save" : "Connect"}
        </Button>
        {p.configured && !p.isDefault && (
          <button
            className="text-xs font-medium text-[#3B82F6] hover:underline disabled:opacity-50"
            disabled={makeDefault.isPending}
            onClick={() => makeDefault.mutate()}
          >
            Make default
          </button>
        )}
        {p.configured && (
          <button
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
            disabled={remove.isPending}
            onClick={() =>
              confirm(`Remove the ${p.label} key? Campaigns using ${p.label} switch to your default provider.`) &&
              remove.mutate()
            }
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
