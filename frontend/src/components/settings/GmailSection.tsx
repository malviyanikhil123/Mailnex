import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { settingsApi } from "../../services/settings.api";
import { Button, Card, Input } from "../ui/primitives";
import { toast } from "../../store/toast";
import { SectionHeader } from "./shared";

export function GmailSection({ configured, email, onSaved }: { configured: boolean; email: string | null; onSaved: () => void }) {
  const [e, setE] = useState(email ?? "");
  const [pw, setPw] = useState("");
  const m = useMutation({
    mutationFn: () => settingsApi.updateGmail(e, pw),
    onSuccess: () => { toast.success("Gmail saved"); setPw(""); onSaved(); },
    onError: () => toast.error("Save failed"),
  });
  return (
    <Card>
      <SectionHeader title="Gmail" badge={configured ? "Configured ✓" : "Not configured"} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input placeholder="Gmail address" value={e} onChange={(ev) => setE(ev.target.value)} />
        <Input type="password" placeholder="App password (write-only)" value={pw} onChange={(ev) => setPw(ev.target.value)} />
      </div>
      <div className="mt-3">
        <Button onClick={() => m.mutate()} disabled={m.isPending || !e || !pw}>Save Gmail</Button>
      </div>
    </Card>
  );
}
