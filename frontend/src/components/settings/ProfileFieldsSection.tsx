import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { settingsApi } from "../../services/settings.api";
import { Button, Card, Input } from "../ui/primitives";
import { toast } from "../../store/toast";
import type { ProfileField } from "../../types/api";
import { errorMessage } from "../../services/errors";
import { SectionHeader } from "./shared";

/** User-defined profile fields, usable in templates as {{key}}. */
export function ProfileFieldsSection({ fields, onSaved }: { fields: ProfileField[]; onSaved: () => void }) {
  const [rows, setRows] = useState<ProfileField[]>(fields);
  useEffect(() => setRows(fields), [fields]);
  const setRow = (i: number, patch: Partial<ProfileField>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const m = useMutation({
    mutationFn: () => settingsApi.saveProfileFields(rows.map((r) => ({ ...r, key: r.key.trim(), label: r.label.trim() }))),
    onSuccess: () => { toast.success("Custom fields saved"); onSaved(); },
    onError: (err) => toast.error(errorMessage(err, "Save failed — keys must be unique, start with a letter, and not be a built-in variable")),
  });

  return (
    <Card>
      <SectionHeader title="Custom profile fields" badge={`${rows.length} field${rows.length === 1 ? "" : "s"}`} />
      <p className="mb-3 text-xs text-gray-500">
        Add any detail you want to reuse in emails — company name, offer, booking link… Use it in a template as{" "}
        <code className="rounded bg-[#BAE6FD]/50 px-1 dark:bg-gray-800">{"{{key}}"}</code>.
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <Input placeholder="Label" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} />
            <Input placeholder="key" className="font-mono" value={r.key} onChange={(e) => setRow(i, { key: e.target.value })} />
            <Input placeholder="Value" value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} />
            <button
              className="px-2 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={() => setRows((r) => [...r, { key: "", label: "", value: "" }])}>+ Add field</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending || rows.some((r) => !r.key.trim() || !r.label.trim())}>
          Save fields
        </Button>
      </div>
    </Card>
  );
}
