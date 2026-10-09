import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { settingsApi } from "../../services/settings.api";
import { Button, Card, Input } from "../ui/primitives";
import { toast } from "../../store/toast";
import { SectionHeader } from "./shared";

export function GeminiSection({ configured, onSaved }: { configured: boolean; onSaved: () => void }) {
  const [key, setKey] = useState("");
  const m = useMutation({
    mutationFn: () => settingsApi.updateGemini(key),
    onSuccess: () => { toast.success("Gemini key saved"); setKey(""); onSaved(); },
    onError: () => toast.error("Save failed"),
  });
  return (
    <Card>
      <SectionHeader title="Gemini" badge={configured ? "Configured ✓" : "Not configured"} />
      <Input type="password" placeholder="Gemini API key (write-only)" value={key} onChange={(e) => setKey(e.target.value)} />
      <div className="mt-3">
        <Button onClick={() => m.mutate()} disabled={m.isPending || !key}>Save Key</Button>
      </div>
    </Card>
  );
}
