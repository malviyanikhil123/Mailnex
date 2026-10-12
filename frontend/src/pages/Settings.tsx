import { useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../services/settings.api";
import { Spinner, ErrorState } from "../components/ui/primitives";
import { GmailSection } from "../components/settings/GmailSection";
import { AiProvidersSection } from "../components/settings/AiProvidersSection";
import { SendersSection } from "../components/settings/SendersSection";
import { ProfileSection } from "../components/settings/ProfileSection";
import { ProfileFieldsSection } from "../components/settings/ProfileFieldsSection";
import { DocumentsSection } from "../components/settings/DocumentsSection";

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
      <AiProvidersSection onSaved={invalidate} />
      <SendersSection primaryEmail={data.gmailEmail} primaryLimit={data.senderDailyLimit} onSaved={invalidate} />
      <ProfileSection profile={data.profile} onSaved={invalidate} />
      <ProfileFieldsSection fields={data.profileFields} onSaved={invalidate} />
      <DocumentsSection />
    </div>
  );
}
