import { useSearchParams } from "react-router-dom";
import ContactsTab from "../components/contacts/ContactsTab";
import ImportsTab from "../components/contacts/ImportsTab";

type Tab = "contacts" | "imports";

const TABS: { key: Tab; label: string }[] = [
  { key: "contacts", label: "Contacts" },
  { key: "imports", label: "Imports" },
];

/** Contacts and their imports, one tab each. The tab (?tab=imports) and the import filter (?import=12) live in the URL. */
export default function Contacts() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "imports" ? "imports" : "contacts";
  const importId = Number(params.get("import")) || undefined;

  const navigate = (next: { tab: Tab; importId?: number }, replace = false) => {
    const p = new URLSearchParams(params);
    if (next.tab === "imports") p.set("tab", "imports");
    else p.delete("tab");
    if (next.importId) p.set("import", String(next.importId));
    else p.delete("import");
    setParams(p, { replace });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Contacts</h1>
        <p className="text-sm text-gray-500">
          Each spreadsheet import becomes its own list — campaigns send to one import.
        </p>
      </div>

      <div className="flex gap-1.5 sm:gap-2" role="tablist" aria-label="Contacts sections">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => !active && navigate({ tab: t.key, importId })}
              className={`rounded-lg px-4 py-1.5 text-sm transition ${
                active
                  ? "bg-[#60A5FA] text-white font-semibold dark:bg-[#71C9CE] dark:text-gray-950"
                  : "bg-[#BAE6FD] text-gray-900 font-medium hover:bg-[#E0F2FE] dark:bg-[#164549] dark:text-[#E3FDFD] dark:hover:bg-[#24666b]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "contacts" ? (
        <ContactsTab importId={importId} onImportChange={(id) => navigate({ tab: "contacts", importId: id }, true)} />
      ) : (
        <ImportsTab onViewContacts={(id) => navigate({ tab: "contacts", importId: id })} />
      )}
    </div>
  );
}
