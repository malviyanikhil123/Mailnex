import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { settingsApi } from "../../services/settings.api";
import { Button, Card, Input } from "../ui/primitives";
import { toast } from "../../store/toast";
import { errorMessage } from "../../services/errors";
import { SectionHeader } from "./shared";
import { AppPasswordField } from "./AppPasswordField";
import { appPasswordError, emailAddressError } from "./appPassword";

export function GmailSection({ configured, email, onSaved }: { configured: boolean; email: string | null; onSaved: () => void }) {
  const [e, setE] = useState(email ?? "");
  const [pw, setPw] = useState("");
  // Errors show once a field is left or Save is pressed, not while the user is still typing.
  const [touched, setTouched] = useState({ email: false, pw: false });
  const emailErr = touched.email ? emailAddressError(e) : null;
  const pwErr = touched.pw ? appPasswordError(pw) : null;
  const m = useMutation({
    mutationFn: () => settingsApi.updateGmail(e.trim(), pw),
    onSuccess: () => {
      toast.success("Gmail saved");
      setPw("");
      setTouched({ email: false, pw: false });
      onSaved();
    },
    onError: (err) => toast.error(errorMessage(err, "Save failed")),
  });
  const save = () => {
    setTouched({ email: true, pw: true });
    if (emailAddressError(e) || appPasswordError(pw)) return;
    m.mutate();
  };
  return (
    <Card>
      <SectionHeader title="Gmail" badge={configured ? "Configured ✓" : "Not configured"} />
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <div>
          <Input
            type="email"
            aria-label="Gmail address"
            placeholder="Gmail address"
            value={e}
            onChange={(ev) => setE(ev.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={emailErr ? true : undefined}
          />
          {emailErr && <p className="mt-1 text-xs text-red-600">{emailErr}</p>}
        </div>
        <AppPasswordField
          value={pw}
          onChange={setPw}
          onBlur={() => setTouched((t) => ({ ...t, pw: true }))}
          error={pwErr}
          placeholder="App password (write-only)"
        />
      </div>
      <div className="mt-3">
        <Button onClick={save} disabled={m.isPending || !e || !pw}>Save Gmail</Button>
      </div>
    </Card>
  );
}
