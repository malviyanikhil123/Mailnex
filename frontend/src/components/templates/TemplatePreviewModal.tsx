import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, ErrorState, Spinner } from "../ui/primitives";
import { Modal } from "../ui/Modal";
import { templatesApi } from "../../services/templates.api";
import { errorMessage } from "../../services/errors";
import type { Contact, ProfileField, SenderProfile, Template } from "../../types/api";
import { HtmlPreview } from "./HtmlPreview";
import { ContactPicker, contactLabel } from "./ContactPicker";
import { sampleVars, splitMissing } from "./variables";

/** Text with each {{placeholder}} that got no value shown as a "no value" chip. */
export function FilledText({ text, contact }: { text: string; contact: Contact | null }) {
  return (
    <>
      {splitMissing(text).map((part, i) =>
        part.missing ? (
          <span
            key={i}
            title={contact ? `This contact has no value for “${part.missing}”` : `Filled from each contact's “${part.missing}” column when sending`}
            className="mx-px rounded border border-dashed border-amber-400 bg-amber-50 px-1 font-mono text-[0.85em] text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          >
            {part.missing}
            <span className="sr-only"> (no value)</span>
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * A saved template rendered by the server the way it would be sent, filled with the
 * user's profile and a sample contact or one of their real contacts ("Preview as").
 */
export function TemplatePreviewModal({
  template,
  profile,
  profileFields,
  onClose,
}: {
  template: Template;
  profile?: SenderProfile;
  profileFields: ProfileField[];
  onClose: () => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const vars = useMemo(() => sampleVars(profile, profileFields, contact), [profile, profileFields, contact]);
  const preview = useQuery({
    queryKey: ["template-preview", template.id, template.updatedAt, vars],
    queryFn: () => templatesApi.preview(template.id, vars),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  const data = preview.data;
  const isHtml = (data?.format ?? template.format) === "html";
  const who = contact ? contactLabel(contact) : "sample values";

  return (
    <Modal onClose={onClose} title="Template preview" maxWidth={isHtml ? "max-w-3xl" : "max-w-lg"}>
      <div className="space-y-3">
        <ContactPicker value={contact} onChange={setContact} />
        {preview.isLoading ? (
          <Spinner />
        ) : preview.isError || !data ? (
          <ErrorState message={errorMessage(preview.error, "Preview failed.")} />
        ) : (
          <div className={`space-y-3 transition-opacity ${preview.isFetching ? "opacity-60" : ""}`} aria-busy={preview.isFetching}>
            <div className="rounded-lg bg-[#BAE6FD] border border-[#BAE6FD] p-3 text-sm dark:bg-gray-800 dark:border-transparent break-words">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                <FilledText text={data.subject} contact={contact} />
              </div>
            </div>
            {isHtml ? (
              <HtmlPreview html={data.body} className="h-[60vh]" label={`Preview (${who})`} />
            ) : (
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-[#F1F5F9] border border-[#BAE6FD] p-3.5 sm:p-4 text-xs font-sans text-gray-800 leading-relaxed dark:bg-gray-800 dark:text-gray-200 dark:border-transparent max-h-60 overflow-y-auto">
                <FilledText text={data.body} contact={contact} />
              </pre>
            )}
          </div>
        )}
        <p className="text-[11px] text-gray-600 dark:text-gray-400">
          {contact
            ? "Uses your profile and this contact's details and spreadsheet columns."
            : "Uses your profile and a sample contact. Spreadsheet columns have no value here and are filled per contact when sending — pick a contact to see them."}
          {" "}Highlighted names are placeholders without a value{isHtml ? " (in HTML designs they show as {{name}})" : ""}.
        </p>
        <div className="flex justify-end pt-1">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
