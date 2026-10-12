import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { settingsApi } from "../../services/settings.api";
import { Button, Card, Input, Textarea } from "../ui/primitives";
import { toast } from "../../store/toast";
import type { SenderProfile } from "../../types/api";
import { errorMessage } from "../../services/errors";
import { SectionHeader } from "./shared";

type LineField = Exclude<keyof SenderProfile, "signature">;

const FIELDS: { key: LineField; label: string; variable: string; type?: string; placeholder?: string }[] = [
  { key: "name", label: "Full name", variable: "my_name", placeholder: "e.g. Priya Shah" },
  { key: "company", label: "Company / organization", variable: "my_company", placeholder: "e.g. Northwind Traders" },
  { key: "email", label: "Email", variable: "my_email", type: "email", placeholder: "you@example.com" },
  { key: "phone", label: "Phone", variable: "my_phone", type: "tel" },
  { key: "website", label: "Website", variable: "my_website", type: "url", placeholder: "https://…" },
  { key: "linkedin", label: "LinkedIn", variable: "my_linkedin", type: "url", placeholder: "https://linkedin.com/in/…" },
];

/** Only the fields this form edits; older keys stored on the server are left untouched. */
function editable(p: SenderProfile): SenderProfile {
  return {
    name: p.name ?? "",
    company: p.company ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    website: p.website ?? "",
    linkedin: p.linkedin ?? "",
    signature: p.signature ?? "",
  };
}

/** What the server sends as {{signature}} while the field is empty (mirrors buildSignature). */
function defaultSignature(p: SenderProfile): string {
  const lines = [p.name, p.company, p.phone, p.website].map((v) => v?.trim()).filter(Boolean);
  return ["Best regards,", ...lines].join("\n");
}

function VariableLabel({ htmlFor, label, variable }: { htmlFor: string; label: string; variable: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-gray-500">
      <span>{label}</span>
      <code className="rounded bg-[#BAE6FD]/50 px-1 font-mono text-[10px] dark:bg-gray-800">{`{{${variable}}}`}</code>
    </label>
  );
}

/** The sender's own details ("My Profile"), available in every template as {{my_*}}. */
export function ProfileSection({ profile, onSaved }: { profile: SenderProfile; onSaved: () => void }) {
  const [p, setP] = useState<SenderProfile>(() => editable(profile));
  useEffect(() => setP(editable(profile)), [profile]);

  const m = useMutation({
    mutationFn: () => settingsApi.updateProfile(p),
    onSuccess: () => { toast.success("Profile saved"); onSaved(); },
    onError: (err) => toast.error(errorMessage(err, "Save failed")),
  });

  return (
    <Card>
      <SectionHeader title="My Profile" />
      <p className="mb-3 text-xs text-gray-500">
        Your own details as the sender. Use them in any template —{" "}
        <code className="rounded bg-[#BAE6FD]/50 px-1 dark:bg-gray-800">{"{{my_name}}"}</code>,{" "}
        <code className="rounded bg-[#BAE6FD]/50 px-1 dark:bg-gray-800">{"{{my_company}}"}</code> and the others shown
        next to each field — and end your emails with{" "}
        <code className="rounded bg-[#BAE6FD]/50 px-1 dark:bg-gray-800">{"{{signature}}"}</code>.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <VariableLabel htmlFor={`profile-${f.key}`} label={f.label} variable={f.variable} />
            <Input
              id={`profile-${f.key}`}
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              value={p[f.key] ?? ""}
              onChange={(e) => setP({ ...p, [f.key]: e.target.value })}
            />
          </div>
        ))}
        <div className="sm:col-span-2">
          <VariableLabel htmlFor="profile-signature" label="Email signature" variable="signature" />
          <Textarea
            id="profile-signature"
            rows={4}
            placeholder={defaultSignature(p)}
            value={p.signature ?? ""}
            onChange={(e) => setP({ ...p, signature: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-gray-500">
            Leave empty to use the default shown above, built from your name, company, phone and website.
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Button onClick={() => m.mutate()} disabled={m.isPending}>Save Profile</Button>
      </div>
    </Card>
  );
}
