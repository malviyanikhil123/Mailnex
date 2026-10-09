import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { settingsApi } from "../../services/settings.api";
import { Button, Card, Input } from "../ui/primitives";
import { toast } from "../../store/toast";
import type { CandidateProfile } from "../../types/api";
import { Labeled, SectionHeader } from "./shared";

export function CandidateSection({ profile, onSaved }: { profile: CandidateProfile; onSaved: () => void }) {
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
