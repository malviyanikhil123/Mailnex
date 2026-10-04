import React, { useState, useEffect } from "react";
import { UserCheck, ShieldAlert, FileText, Save, Check } from "lucide-react";
import { api } from "../services/api";
import type { Profile, Settings, Me } from "../types";

interface ProfileTabProps {
  user: Me;
  profile: Profile | null;
  settings: Settings | null;
  onOpenUploadResume: () => void;
  onSettingsSaved: (settings: Settings) => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  user,
  profile,
  settings,
  onOpenUploadResume,
  onSettingsSaved,
}) => {
  // Form fields state
  const [targetRoles, setTargetRoles] = useState("");
  const [countries, setCountries] = useState("");
  const [salaryFloor, setSalaryFloor] = useState<string>("");
  const [salaryCurrency, setSalaryCurrency] = useState("INR");
  const [maxAgeDays, setMaxAgeDays] = useState(45);
  const [currentEmployer, setCurrentEmployer] = useState("");
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailAppPassword, setGmailAppPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (settings) {
      setTargetRoles((settings.targetRoles || []).join(", "));
      setCountries((settings.countries || []).join(", "));
      setSalaryFloor(settings.salaryFloor != null ? String(settings.salaryFloor) : "");
      setSalaryCurrency(settings.salaryCurrency || "INR");
      setMaxAgeDays(settings.maxAgeDays || 45);
      setCurrentEmployer(settings.currentEmployer || "");
      setGmailEmail(settings.gmailEmail || "");
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSavedSuccess(false);

    try {
      const payload: Partial<Settings> = {
        targetRoles: targetRoles.split(",").map((s) => s.trim()).filter(Boolean),
        countries: countries.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
        salaryFloor: salaryFloor.trim() === "" ? null : Number(salaryFloor),
        salaryCurrency: salaryCurrency.trim() || null,
        maxAgeDays: Number(maxAgeDays) || 45,
        currentEmployer: currentEmployer.trim() || null,
        gmailEmail: gmailEmail.trim() || null,
      };

      if (gmailAppPassword.trim()) {
        (payload as any).gmailAppPassword = gmailAppPassword.trim();
      }

      const res = await api.saveSettings(payload);
      onSettingsSaved(res.settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Could not save preferences");
    } finally {
      setSaving(false);
    }
  };

  const knockouts = profile?.knockouts || {};

  return (
    <div className="space-y-6">
      {/* Resume Dossier Card */}
      <div className="frame">
        <div className="frame-head">
          <h2>
            <UserCheck size={15} className="text-aqua" />
            Resume Intelligence Dossier
          </h2>
          <button
            className="btn-quiet text-xs py-1 px-3 flex items-center gap-1.5"
            onClick={onOpenUploadResume}
          >
            <FileText size={13} />
            <span>Update / Re-read Resume</span>
          </button>
        </div>

        <div className="frame-body">
          {profile ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Extracted Facts */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <span className="text-xs font-caps tracking-wider text-dim uppercase">Candidate Name</span>
                  <span className="text-white font-medium">{profile.full_name}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <span className="text-xs font-caps tracking-wider text-dim uppercase">Base Location</span>
                  <span className="text-ink">
                    {[profile.city, profile.country].filter(Boolean).join(", ") || "Unspecified"}
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <span className="text-xs font-caps tracking-wider text-dim uppercase">Career Stage</span>
                  <span className="text-ink capitalize">
                    {profile.seniority} ·{" "}
                    <strong className="text-aqua num">{profile.years_experience || "0"}</strong> yrs
                    paid work
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <span className="text-xs font-caps tracking-wider text-dim uppercase">Academic Credential</span>
                  <span className="text-ink">{profile.degree || "—"}</span>
                </div>
                <div>
                  <span className="text-xs font-caps tracking-wider text-dim uppercase block mb-1.5">
                    Targeted Role Families
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(profile.target_roles || []).map((r, i) => (
                      <span key={i} className="tag">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Exclusion & Knockout Rules */}
              <div className="p-4 bg-field rounded border border-line space-y-3">
                <div className="flex items-center gap-2 text-xs font-caps tracking-wider text-bad uppercase font-bold">
                  <ShieldAlert size={14} /> Strict Elimination Rules
                </div>
                <ul className="text-xs font-mono space-y-2 text-dim">
                  <li className="flex items-start gap-2">
                    <span className="text-bad">✕</span>
                    <span>
                      Skip when experience demands exceed{" "}
                      <strong className="text-white num">{knockouts.maxYearsAsked ?? "—"}</strong> years.
                    </span>
                  </li>
                  {profile.never_contact && profile.never_contact.length > 0 && (
                    <li className="flex items-start gap-2">
                      <span className="text-bad">✕</span>
                      <span>
                        Never contact employers:{" "}
                        <strong className="text-white">
                          {profile.never_contact.join(", ")}
                        </strong>
                      </span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <span className="text-bad">✕</span>
                    <span>
                      Compensation filter: Dropped if below{" "}
                      <strong className="text-white num">
                        {profile.salary_floor ? profile.salary_floor.toLocaleString() : "None"}
                      </strong>{" "}
                      {profile.salary_currency}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-dim font-mono">
              <p>No resume has been parsed yet.</p>
              <button className="btn-primary mt-3" onClick={onOpenUploadResume}>
                Paste or Upload Resume Now
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Preferences Form */}
      <div className="frame">
        <div className="frame-head">
          <h2>Search Criteria & Alert Mailbox</h2>
          <span className="meta">Applies across all automated sweeps</span>
        </div>

        <div className="frame-body">
          {error && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-group md:col-span-2">
                <label className="form-label" htmlFor="targetRoles">
                  Target Roles (comma-separated)
                </label>
                <input
                  id="targetRoles"
                  className="form-control"
                  placeholder="e.g. Business Analyst, Data Analyst, Product Analyst"
                  value={targetRoles}
                  onChange={(e) => setTargetRoles(e.target.value)}
                />
                <div className="form-hint">These seeds guide web scrapers and email alert parsers.</div>
              </div>

              <div className="form-group md:col-span-2">
                <label className="form-label" htmlFor="countries">
                  Eligible Work Locations (comma-separated codes)
                </label>
                <input
                  id="countries"
                  className="form-control"
                  placeholder="in, remote, gb, us"
                  value={countries}
                  onChange={(e) => setCountries(e.target.value)}
                />
                <div className="form-hint">
                  Two-letter country codes (e.g. in, gb, us), plus "remote" for worldwide listings.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="salaryFloor">
                  Salary Minimum Floor (per annum)
                </label>
                <input
                  id="salaryFloor"
                  type="number"
                  className="form-control"
                  placeholder="Leave empty for no limit"
                  value={salaryFloor}
                  onChange={(e) => setSalaryFloor(e.target.value)}
                />
                <div className="form-hint">Jobs with compensation stated below this are marked low.</div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="salaryCurrency">
                  Currency Symbol / Code
                </label>
                <input
                  id="salaryCurrency"
                  className="form-control"
                  placeholder="INR, USD, EUR"
                  value={salaryCurrency}
                  onChange={(e) => setSalaryCurrency(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="maxAgeDays">
                  Maximum Advert Age (Days)
                </label>
                <input
                  id="maxAgeDays"
                  type="number"
                  min="1"
                  max="365"
                  className="form-control"
                  value={maxAgeDays}
                  onChange={(e) => setMaxAgeDays(Number(e.target.value))}
                />
                <div className="form-hint">Adverts older than this are dropped as already closed.</div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="currentEmployer">
                  Current Employer (Never Contact)
                </label>
                <input
                  id="currentEmployer"
                  className="form-control"
                  placeholder="Comma-separated company names"
                  value={currentEmployer}
                  onChange={(e) => setCurrentEmployer(e.target.value)}
                />
                <div className="form-hint">Their postings will never appear in your feeds.</div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="gmailEmail">
                  Gmail Alert Address
                </label>
                <input
                  id="gmailEmail"
                  type="email"
                  className="form-control"
                  placeholder="you@gmail.com"
                  value={gmailEmail}
                  onChange={(e) => setGmailEmail(e.target.value)}
                />
                <div className="form-hint">Where job boards and recruiters send alert notifications.</div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="gmailAppPassword">
                  Google App Password
                </label>
                <input
                  id="gmailAppPassword"
                  type="password"
                  autoComplete="new-password"
                  className="form-control"
                  placeholder="16-character Google app password"
                  value={gmailAppPassword}
                  onChange={(e) => setGmailAppPassword(e.target.value)}
                />
                <div className="form-hint">
                  Generated in Google Security settings. Encrypted on the server before write.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-line">
              <span className="text-xs font-mono text-ok">
                {savedSuccess && (
                  <span className="flex items-center gap-1">
                    <Check size={14} /> Saved settings successfully.
                  </span>
                )}
              </span>

              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={14} />
                <span>{saving ? "Saving Preferences..." : "Save Preferences"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
