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
      <div className="grid gap-3 md:grid-cols-2">
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
      <div className="grid gap-3 md:grid-cols-4">
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
      <div className="grid gap-3 md:grid-cols-2">
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

function ResumeSection({ fileName, onSaved }: { fileName: string | null; onSaved: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const m = useMutation({
    mutationFn: (file: File) => settingsApi.uploadResume(file),
    onSuccess: () => { toast.success("Resume uploaded"); onSaved(); },
    onError: () => toast.error("Upload failed"),
  });
  return (
    <Card>
      <SectionHeader title="Resume" badge={fileName ?? "No resume"} />
      <input
        ref={ref}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && m.mutate(e.target.files[0])}
      />
      <Button variant="secondary" onClick={() => ref.current?.click()} disabled={m.isPending}>
        {fileName ? "Replace Resume" : "Upload Resume"}
      </Button>
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
