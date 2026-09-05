import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../services/settings.api";
import { Button, Card, Input, Spinner, ErrorState } from "../components/ui/primitives";
import { toast } from "../store/toast";
import type { CandidateProfile } from "../types/api";

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
      <CampaignSection
        defaults={data.campaign}
        provider={data.emailProvider}
        onSaved={invalidate}
      />
      <CandidateSection profile={data.candidate} onSaved={invalidate} />
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

function CampaignSection({
  defaults,
  provider,
  onSaved,
}: {
  defaults: { dailyLimit: number; startHour: number; endHour: number; testEmail: string | null; mode: string } | null;
  provider: string;
  onSaved: () => void;
}) {
  const [dailyLimit, setDailyLimit] = useState(defaults?.dailyLimit ?? 50);
  const [startHour, setStartHour] = useState(defaults?.startHour ?? 9);
  const [endHour, setEndHour] = useState(defaults?.endHour ?? 18);
  const [testEmail, setTestEmail] = useState(defaults?.testEmail ?? "");
  const m = useMutation({
    mutationFn: () =>
      settingsApi.updateCampaign({
        dailyLimit,
        startHour,
        endHour,
        emailProvider: provider,
        ...(testEmail ? { testEmail } : {}),
      }),
    onSuccess: () => { toast.success("Campaign settings saved"); onSaved(); },
    onError: () => toast.error("Save failed (check the sending window)"),
  });
  return (
    <Card>
      <SectionHeader title="Campaign" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Labeled label="Daily limit">
          <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(+e.target.value)} />
        </Labeled>
        <Labeled label="Start hour">
          <Input type="number" value={startHour} onChange={(e) => setStartHour(+e.target.value)} />
        </Labeled>
        <Labeled label="End hour">
          <Input type="number" value={endHour} onChange={(e) => setEndHour(+e.target.value)} />
        </Labeled>
        <Labeled label="Test email">
          <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
        </Labeled>
      </div>
      <div className="mt-3">
        <Button onClick={() => m.mutate()} disabled={m.isPending}>Save Campaign</Button>
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
      <SectionHeader title="Candidate Profile" />
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
