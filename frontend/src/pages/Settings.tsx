import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../services/settings.api";
import { sendersApi } from "../services/senders.api";
import { Button, Card, Input, Spinner, ErrorState } from "../components/ui/primitives";
import { toast } from "../store/toast";
import type { CandidateProfile, ProfileField, SenderAccount } from "../types/api";

export default function Settings() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["settings"] });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="Failed to load settings." />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <GmailSection configured={data.gmailConfigured} email={data.gmailEmail} onSaved={invalidate} />
      <GeminiSection configured={data.geminiConfigured} onSaved={invalidate} />
      <SendersSection primaryEmail={data.gmailEmail} primaryLimit={data.senderDailyLimit} onSaved={invalidate} />
      <CandidateSection profile={data.candidate} onSaved={invalidate} />
      <ProfileFieldsSection fields={data.profileFields} onSaved={invalidate} />
      <ResumeSection fileName={data.resumeFileName} onSaved={invalidate} />
    </div>
  );
}

function GmailSection({ configured, email, onSaved }: { configured: boolean; email: string | null; onSaved: () => void }) {
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

function GeminiSection({ configured, onSaved }: { configured: boolean; onSaved: () => void }) {
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

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

/** Gmail accounts campaigns can send from. App passwords are write-only: verified
 *  against Gmail on save, stored encrypted, and never shown again. */
function SendersSection({
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
  const add = useMutation({
    mutationFn: () => sendersApi.create(form),
    onSuccess: () => {
      toast.success("Sender added");
      setForm({ label: "", email: "", appPassword: "", dailyLimit: 50 });
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not add sender")),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<SenderAccount> & { appPassword?: string } }) =>
      sendersApi.update(id, patch),
    onSuccess: () => { toast.success("Sender updated"); refresh(); },
    onError: (err) => toast.error(errorMessage(err, "Update failed")),
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
                onClick={() => {
                  const appPassword = prompt(`New app password for ${s.email}`)?.trim();
                  if (appPassword) update.mutate({ id: s.id, patch: { appPassword } });
                }}
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
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder="Label (e.g. Sales)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <Input placeholder="Gmail address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input
          type="password"
          autoComplete="new-password"
          placeholder="App password (write-only)"
          value={form.appPassword}
          onChange={(e) => setForm({ ...form, appPassword: e.target.value })}
        />
        <Input
          type="number"
          min={1}
          placeholder="Daily limit"
          value={form.dailyLimit}
          onChange={(e) => setForm({ ...form, dailyLimit: +e.target.value })}
        />
      </div>
      <div className="mt-3">
        <Button onClick={() => add.mutate()} disabled={add.isPending || !form.label || !form.email || !form.appPassword}>
          {add.isPending ? "Verifying with Gmail…" : "+ Add sender"}
        </Button>
      </div>
    </Card>
  );
}

function CandidateSection({ profile, onSaved }: { profile: CandidateProfile; onSaved: () => void }) {
  const [p, setP] = useState<CandidateProfile>(profile);
  const [skills, setSkills] = useState((profile.skills ?? []).join(", "));
  useEffect(() => setP(profile), [profile]);

  const m = useMutation({
    mutationFn: () =>
      settingsApi.updateCandidate({
        ...p,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => { toast.success("Profile saved"); onSaved(); },
    onError: () => toast.error("Save failed"),
  });

  const field = (k: keyof CandidateProfile, label: string) => (
    <Labeled label={label}>
      <Input value={(p[k] as string) ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
    </Labeled>
  );

  return (
    <Card>
      <SectionHeader title="My Profile" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("name", "Name")}
        {field("phone", "Phone")}
        {field("email", "Email")}
        {field("role", "Role")}
        {field("experience", "Experience")}
        <Labeled label="Skills (comma-separated)">
          <Input value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Labeled>
        {field("linkedin", "LinkedIn")}
        {field("github", "GitHub")}
        {field("portfolio", "Portfolio")}
      </div>
      <div className="mt-3">
        <Button onClick={() => m.mutate()} disabled={m.isPending}>Save Profile</Button>
      </div>
    </Card>
  );
}

/** User-defined profile fields, usable in templates as {{key}}. */
function ProfileFieldsSection({ fields, onSaved }: { fields: ProfileField[]; onSaved: () => void }) {
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

function ResumeSection({ fileName: _fileName, onSaved }: { fileName: string | null; onSaved: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeName, setResumeName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: resumes = [], isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: settingsApi.listResumes,
  });

  const upload = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error("No file selected");
      return settingsApi.uploadResumeFile(selectedFile, resumeName.trim() || undefined);
    },
    onSuccess: () => {
      toast.success("Resume uploaded successfully");
      setResumeName("");
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["resumes"] });
      onSaved();
    },
    onError: () => toast.error("Failed to upload resume"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => settingsApi.deleteResume(id),
    onSuccess: () => {
      toast.success("Resume deleted");
      qc.invalidateQueries({ queryKey: ["resumes"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
      onSaved();
    },
    onError: () => toast.error("Failed to delete resume"),
  });

  return (
    <Card>
      <SectionHeader
        title="Resumes & CVs"
        badge={resumes.length > 0 ? `${resumes.length} Uploaded` : "No resumes"}
      />
      <p className="text-xs text-gray-500 mb-4">
        Upload multiple targeted resumes (e.g., Full Stack, Backend, Frontend). You can link specific resumes to specific templates in the Templates tab.
      </p>

      {/* Upload Box */}
      <div className="rounded-xl border border-dashed border-[#BAE6FD] bg-[#F1F5F9] p-4 dark:border-[#164549] dark:bg-[#0e2124]/40 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Resume Label / Role
            </label>
            <Input
              placeholder="e.g. Full Stack Developer"
              value={resumeName}
              onChange={(e) => setResumeName(e.target.value)}
            />
          </div>

          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              PDF Document
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
            />
            <Button
              variant="secondary"
              className="w-full truncate text-xs"
              onClick={() => fileRef.current?.click()}
            >
              {selectedFile ? `📄 ${selectedFile.name}` : "Choose PDF…"}
            </Button>
          </div>

          <div className="sm:col-span-1">
            <Button
              className="w-full text-xs"
              disabled={upload.isPending || !selectedFile}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? "Uploading…" : "+ Add Resume"}
            </Button>
          </div>
        </div>
      </div>

      {/* Resumes List */}
      {isLoading ? (
        <Spinner />
      ) : resumes.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-500">
          No resumes uploaded yet. Add your first resume above to connect it with outreach templates.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {resumes.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between p-3 rounded-lg border border-[#BAE6FD]/70 bg-[#F1F5F9] dark:border-gray-800 dark:bg-gray-800/40"
            >
              <div className="min-w-0 flex-1 pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">📄</span>
                  <span className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                    {r.name}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">
                  {r.fileName} • {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>

              <button
                type="button"
                onClick={() => confirm(`Delete resume "${r.name}"?`) && remove.mutate(r.id)}
                className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-semibold">{title}</h2>
      {badge && <span className="text-xs text-gray-500">{badge}</span>}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}
