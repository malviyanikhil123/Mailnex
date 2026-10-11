import { useEffect, useId, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { contactsApi } from "../../services/contacts.api";
import { Input, selectClass } from "../ui/primitives";
import type { Contact } from "../../types/api";
import { SAMPLE_CONTACT } from "./variables";

const PAGE = 20;
const SEARCH_DELAY_MS = 250;

export function contactLabel(c: Contact): string {
  const name = [c.firstName, c.lastName].map((p) => p?.trim()).filter(Boolean).join(" ") || c.contactPerson?.trim();
  const who = [name, c.companyName?.trim()].filter(Boolean).join(" · ");
  return who ? `${who} <${c.email}>` : c.email;
}

/**
 * "Preview as": the sample contact, or one of the user's contacts (searchable by name,
 * email or company) whose values and spreadsheet columns fill the template.
 */
export function ContactPicker({ value, onChange }: { value: Contact | null; onChange: (contact: Contact | null) => void }) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [search]);

  const contacts = useQuery({
    queryKey: ["contacts", "preview-picker", query],
    queryFn: () => contactsApi.list({ search: query || undefined, limit: PAGE }),
    placeholderData: keepPreviousData,
  });
  const rows = contacts.data?.rows ?? [];
  // Keep the chosen contact selectable while the search shows others.
  const options = value && !rows.some((c) => c.id === value.id) ? [value, ...rows] : rows;
  const more = (contacts.data?.total ?? 0) - rows.length;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-end">
      <div>
        <label htmlFor={`${id}-search`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          Preview as
        </label>
        <Input
          id={`${id}-search`}
          type="search"
          placeholder="Search contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div>
        <select
          aria-label="Contact to preview as"
          className={selectClass}
          value={value?.id ?? ""}
          onChange={(e) => {
            const picked = options.find((c) => c.id === Number(e.target.value));
            onChange(picked ?? null);
          }}
        >
          <option value="">Sample contact ({SAMPLE_CONTACT.full_name}, {SAMPLE_CONTACT.company})</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{contactLabel(c)}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400" aria-live="polite">
          {contacts.isError
            ? "Could not load your contacts."
            : contacts.isLoading
              ? "Loading contacts…"
              : rows.length === 0
                ? query ? "No contacts match." : "No contacts yet — import some to preview with real data."
                : more > 0 ? `Showing ${rows.length} of ${contacts.data!.total}. Search to narrow down.` : `${rows.length} contact${rows.length === 1 ? "" : "s"}`}
        </p>
      </div>
    </div>
  );
}
