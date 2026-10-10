import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { aiApi } from "../../services/ai.api";
import { templatesApi } from "../../services/templates.api";
import { Button, ErrorState, Input, Spinner, Textarea } from "../ui/primitives";
import { Modal } from "../ui/Modal";
import { errorMessage } from "../settings/shared";
import type { AiProviderId, GeneratedHtml } from "../../types/api";

const TONES = ["Professional", "Friendly", "Bold", "Minimal", "Playful", "Formal"];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 2000;

const selectClass =
  "w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100";

/** "Generate with AI": describe the email, get an HTML design to review in the editor. */
export function GenerateHtmlDialog({ onClose, onGenerated }: { onClose: () => void; onGenerated: (result: GeneratedHtml) => void }) {
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: aiApi.list });
  const connected = providers.data?.filter((p) => p.configured) ?? [];
  const defaultProvider = connected.find((p) => p.isDefault);

  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("Professional");
  const [brandColor, setBrandColor] = useState("");
  const [includeVariables, setIncludeVariables] = useState(true);
  const [provider, setProvider] = useState<AiProviderId | "">("");

  // useMutation's onSuccess still fires after the dialog is closed (backdrop / ✕ while
  // the AI is working): a late design must not replace what is in the editor then.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  const colorInvalid = brandColor !== "" && !HEX_COLOR.test(brandColor);
  const descriptionLength = description.trim().length;

  const generate = useMutation({
    mutationFn: () =>
      templatesApi.generateHtml({
        description: description.trim(),
        tone: tone.trim() || undefined,
        brandColor: brandColor || undefined,
        includeVariables,
        provider: provider || null,
      }),
    onSuccess: (result) => {
      if (!open.current) return;
      onGenerated(result);
      onClose();
    },
  });

  return (
    <Modal title="Generate an HTML email with AI" onClose={onClose}>
      {providers.isLoading ? (
        <Spinner />
      ) : providers.isError ? (
        <ErrorState message="Could not load your AI providers — close this and try again." />
      ) : connected.length === 0 ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Generating a design uses your own AI provider, and none is connected yet. Add an API key (OpenAI, Anthropic,
            Google or Groq) in{" "}
            <Link to="/settings" className="font-semibold underline" onClick={onClose}>
              Settings → AI providers
            </Link>
            , then come back here.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            generate.mutate();
          }}
        >
          <div>
            <label htmlFor="gen-description" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              What should the email be about?
            </label>
            <Textarea
              id="gen-description"
              rows={4}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Announce our new booking app to local gyms: one headline, three short benefits and a 'Book a demo' button."
            />
            <p className="mt-0.5 text-right text-[11px] text-gray-500">{descriptionLength}/{DESCRIPTION_MAX}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="gen-tone" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Tone</label>
              <Input id="gen-tone" list="gen-tones" maxLength={60} value={tone} onChange={(e) => setTone(e.target.value)} />
              <datalist id="gen-tones">
                {TONES.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor="gen-color" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Brand color (optional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick brand color"
                  value={HEX_COLOR.test(brandColor) && brandColor.length === 7 ? brandColor : "#2563eb"}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-9 w-10 shrink-0 cursor-pointer rounded border border-[#BAE6FD] bg-transparent dark:border-[#164549]"
                />
                <Input
                  id="gen-color"
                  placeholder="#2563eb"
                  className="font-mono"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value.trim())}
                />
              </div>
              {colorInvalid && <p className="mt-1 text-[11px] text-red-600">Use a hex color like #2563eb.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
            <div>
              <label htmlFor="gen-provider" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">AI provider</label>
              <select
                id="gen-provider"
                className={selectClass}
                value={provider}
                onChange={(e) => setProvider(e.target.value as AiProviderId | "")}
              >
                <option value="">Default{defaultProvider ? ` (${defaultProvider.label})` : ""}</option>
                {connected.map((p) => (
                  <option key={p.provider} value={p.provider}>{p.label}</option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 py-2 text-sm text-gray-800 dark:text-gray-200">
              <input type="checkbox" checked={includeVariables} onChange={(e) => setIncludeVariables(e.target.checked)} />
              Use variables like {"{{first_name}}"} and {"{{company}}"}
            </label>
          </div>

          {generate.isError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {errorMessage(generate.error, "Could not generate the design — try again.")}
            </p>
          )}
          <p className="text-[11px] text-gray-600 dark:text-gray-400">
            The design replaces what is in the HTML editor. Nothing is saved until you click Save, so you can review and edit it first.
          </p>

          <div className="flex flex-col-reverse gap-2 border-t border-[#BAE6FD]/40 pt-3 sm:flex-row sm:justify-end dark:border-gray-800">
            <Button type="button" variant="secondary" onClick={onClose} disabled={generate.isPending}>Cancel</Button>
            <Button type="submit" disabled={generate.isPending || descriptionLength < DESCRIPTION_MIN || colorInvalid}>
              {generate.isPending ? "Designing… (up to a minute)" : "Generate design"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
