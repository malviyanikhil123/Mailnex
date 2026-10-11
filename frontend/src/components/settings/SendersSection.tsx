import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../../services/settings.api";
import { sendersApi } from "../../services/senders.api";
import { Button, Card, Input, Labeled } from "../ui/primitives";
import { toast } from "../../store/toast";
import type { SenderAccount } from "../../types/api";
import { errorMessage } from "../../services/errors";
import { SectionHeader } from "./shared";
import { AppPasswordField } from "./AppPasswordField";
import { appPasswordError, emailAddressError } from "./appPassword";

/** Inline form to rotate one sender's app password. */
function ChangeAppPasswordForm({
  email,
  saving,
  onSave,
  onCancel,
}: {
  email: string;
  saving: boolean;
  onSave: (appPassword: string) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState("");
  const [touched, setTouched] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!appPasswordError(pw)) onSave(pw);
  };
  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="basis-full space-y-2 border-t border-[#BAE6FD]/70 pt-2 dark:border-gray-800"
    >
      <AppPasswordField
        label={`New app password for ${email}`}
        placeholder="New app password"
        value={pw}
        onChange={setPw}
        onBlur={() => setTouched(true)}
        error={touched ? appPasswordError(pw) : null}
        autoFocus
      />
      <div className="flex gap-2">
        <Button type="submit" className="text-xs" disabled={saving || !pw}>
          {saving ? "Verifying with Gmail…" : "Save password"}
        </Button>
        <Button type="button" variant="secondary" className="text-xs" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Gmail accounts campaigns can send from. App passwords are write-only: verified
 *  against Gmail on save, stored encrypted, and never shown again. */
export function SendersSection({
  primaryEmail,
  primaryLimit,
  onSaved,
}: {
  primaryEmail: string | null;
  primaryLimit: number;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { data: senders = [] } = useQuery({ queryKey: ["senders"], queryFn: sendersApi.list });
  const refresh = () => qc.invalidateQueries({ queryKey: ["senders"] });

  const [limit, setLimit] = useState(primaryLimit);
  useEffect(() => setLimit(primaryLimit), [primaryLimit]);
  const saveLimit = useMutation({
    mutationFn: () => settingsApi.updateSending(limit),
    onSuccess: () => { toast.success("Primary Gmail limit saved"); onSaved(); },
    onError: () => toast.error("Save failed"),
  });

  const [form, setForm] = useState({ label: "", email: "", appPassword: "", dailyLimit: 50 });
  // Inline errors show once a field is left or "Add sender" is pressed.
  const [touched, setTouched] = useState({ email: false, appPassword: false });
  const emailErr = touched.email ? emailAddressError(form.email) : null;
  const pwErr = touched.appPassword ? appPasswordError(form.appPassword) : null;
  const add = useMutation({
    mutationFn: () => sendersApi.create({ ...form, email: form.email.trim() }),
    onSuccess: () => {
      toast.success("Sender added");
      setForm({ label: "", email: "", appPassword: "", dailyLimit: 50 });
      setTouched({ email: false, appPassword: false });
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not add sender")),
  });
  const submitAdd = () => {
    setTouched({ email: true, appPassword: true });
    if (emailAddressError(form.email) || appPasswordError(form.appPassword)) return;
    add.mutate();
  };
  const [changingPasswordId, setChangingPasswordId] = useState<number | null>(null);
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<SenderAccount> }) => sendersApi.update(id, patch),
    onSuccess: () => { toast.success("Sender updated"); refresh(); },
    onError: (err) => toast.error(errorMessage(err, "Update failed")),
  });
  // Separate from `update` so activating another sender doesn't look like a Gmail check.
  const changePassword = useMutation({
    mutationFn: ({ id, appPassword }: { id: number; appPassword: string }) => sendersApi.update(id, { appPassword }),
    onSuccess: (_data, { id }) => {
      toast.success("App password updated");
      setChangingPasswordId((current) => (current === id ? null : current));
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not change the app password")),
  });
  const remove = useMutation({
    mutationFn: (id: number) => sendersApi.remove(id),
    onSuccess: () => {
      toast.success("Sender removed");
      refresh();
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err) => toast.error(errorMessage(err, "Delete failed")),
  });

  return (
    <Card>
      <SectionHeader title="Sender accounts" badge={`${senders.length + 1} account${senders.length ? "s" : ""}`} />
      <p className="mb-3 text-xs text-gray-500">
        Each account sends at most one email per minute and stops at its own daily limit, however many campaigns use it.
        App passwords are checked with Gmail, stored encrypted, and never shown again.
      </p>

      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-[#BAE6FD]/70 p-3 sm:flex-row sm:items-end dark:border-gray-800">
        <div className="flex-1 text-sm">
          <div className="font-medium">Primary Gmail</div>
          <div className="text-xs text-gray-500">{primaryEmail ?? "Not configured — set it in the Gmail section above"}</div>
        </div>
        <Labeled label="Daily limit">
          <Input type="number" min={1} className="sm:w-28" value={limit} onChange={(e) => setLimit(+e.target.value)} />
        </Labeled>
        <Button variant="secondary" className="text-xs" onClick={() => saveLimit.mutate()} disabled={saveLimit.isPending || limit < 1}>
          Save
        </Button>
      </div>

      {senders.length > 0 && (
        <div className="mb-4 space-y-2">
          {senders.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#BAE6FD]/70 p-3 text-sm dark:border-gray-800">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.label} {!s.active && <span className="text-xs text-gray-500">(inactive)</span>}</div>
                <div className="truncate text-xs text-gray-500">{s.email} · {s.dailyLimit}/day</div>
              </div>
              <button
                className="text-xs font-medium text-[#3B82F6] hover:underline"
                onClick={() => update.mutate({ id: s.id, patch: { active: !s.active } })}
              >
                {s.active ? "Deactivate" : "Activate"}
              </button>
              <button
                className="text-xs font-medium text-[#3B82F6] hover:underline"
                aria-expanded={changingPasswordId === s.id}
                onClick={() => setChangingPasswordId(changingPasswordId === s.id ? null : s.id)}
              >
                Change password
              </button>
              <button
                className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                onClick={() =>
                  confirm(`Remove ${s.email}? Campaigns using it fall back to the primary Gmail.`) && remove.mutate(s.id)
                }
              >
                Remove
              </button>
              {changingPasswordId === s.id && (
                <ChangeAppPasswordForm
                  email={s.email}
                  saving={changePassword.isPending && changePassword.variables?.id === s.id}
                  onSave={(appPassword) => changePassword.mutate({ id: s.id, appPassword })}
                  onCancel={() => setChangingPasswordId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <Input
          aria-label="Label"
          placeholder="Label (e.g. Sales)"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
        <div>
          <Input
            type="email"
            aria-label="Gmail address"
            placeholder="Gmail address"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={emailErr ? true : undefined}
          />
          {emailErr && <p className="mt-1 text-xs text-red-600">{emailErr}</p>}
        </div>
        <AppPasswordField
          value={form.appPassword}
          onChange={(appPassword) => setForm({ ...form, appPassword })}
          onBlur={() => setTouched((t) => ({ ...t, appPassword: true }))}
          error={pwErr}
          placeholder="App password (write-only)"
        />
        <Input
          type="number"
          min={1}
          aria-label="Daily limit"
          placeholder="Daily limit"
          value={form.dailyLimit}
          onChange={(e) => setForm({ ...form, dailyLimit: +e.target.value })}
        />
      </div>
      <div className="mt-3">
        <Button onClick={submitAdd} disabled={add.isPending || !form.label || !form.email || !form.appPassword}>
          {add.isPending ? "Verifying with Gmail…" : "+ Add sender"}
        </Button>
      </div>
    </Card>
  );
}
