import type { ProfileField } from "../../types/api";
import { CONTACT_VARIABLES, SENDER_VARIABLES, type TemplateVariable } from "./variables";

const chipClass =
  "inline-flex items-center rounded-md bg-[#BAE6FD] hover:bg-[#93c5fd] active:scale-95 px-2 py-0.5 text-xs font-mono font-medium text-[#0F172A] border border-[#7dd3fc] transition dark:bg-[#164549] dark:text-[#E3FDFD] dark:border-transparent dark:hover:bg-[#24666b]";

function Group({ title, vars, onInsert }: { title: string; vars: TemplateVariable[]; onInsert: (token: string) => void }) {
  if (vars.length === 0) return null;
  return (
    <div>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {vars.map((v) => (
          <button key={v.key} type="button" title={v.label} className={chipClass} onClick={() => onInsert(`{{${v.key}}}`)}>
            {`{{${v.key}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Insertable variables: sender, contact and the user's custom profile fields. */
export function VariablePicker({ profileFields, onInsert }: { profileFields: ProfileField[]; onInsert: (token: string) => void }) {
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">Variables (tap to insert at the cursor):</span>
      <Group title="You (My Profile)" vars={SENDER_VARIABLES} onInsert={onInsert} />
      <Group title="Contact" vars={CONTACT_VARIABLES} onInsert={onInsert} />
      <Group
        title="Your custom fields"
        vars={profileFields.map((f) => ({ key: f.key, label: f.label }))}
        onInsert={onInsert}
      />
      <p className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
        Extra spreadsheet columns work too: a column named <code className="font-mono">industry</code> becomes{" "}
        <code className="font-mono">{"{{industry}}"}</code>. Add a fallback for missing values with{" "}
        <code className="font-mono">{"{{first_name|there}}"}</code> → “there” when a contact has no first name.
      </p>
    </div>
  );
}
