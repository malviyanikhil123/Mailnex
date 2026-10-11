import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contactsApi, type ImportProgress, type ListImportsParams } from "../../services/contacts.api";
import { Button, Card, Input, Spinner, ErrorState } from "../ui/primitives";
import { toast } from "../../store/toast";
import { Pager, filterSelectClass, tableHeadClass, tableRowClass, varName } from "./shared";

const RECOGNIZED_COLUMNS = [
  "Email",
  "First name",
  "Last name",
  "Name / Full name (split into first and last name)",
  "Company / Organization / Business",
  "Phone / Mobile",
  "Website / URL / Domain",
  "Location / City / Country / Address",
];

const BUILT_IN_VARS = [
  "first_name",
  "last_name",
  "full_name",
  "company",
  "location",
  "contact_email",
  "contact_phone",
  "contact_website",
];

/** Upload form plus the import history, with its own search, sort and pagination. */
export default function ImportsTab({ onViewContacts }: { onViewContacts: (importId: number) => void }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NonNullable<ListImportsParams["sort"]>>("newest");
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["imports", "list", search, sort, page],
    queryFn: () => contactsApi.listImports({ search: search || undefined, sort, page, limit }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="space-y-4">
      <UploadCard />

      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Input
              placeholder="Search import or file name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setPage(1);
            }}
            className={filterSelectClass}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState message="Failed to load imports." />
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[860px]">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">File</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-right">Imported</th>
                    <th className="py-2.5 px-3 text-right">Duplicate</th>
                    <th className="py-2.5 px-3 text-right">Invalid</th>
                    <th className="py-2.5 px-3 text-right">Contacts</th>
                    <th className="py-2.5 px-3 text-right">Pending</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.imports.map((imp) => (
                    <tr key={imp.id} className={`${tableRowClass} text-xs sm:text-sm`}>
                      <td className="py-2.5 px-3 max-w-[220px]">
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{imp.name || "—"}</div>
                        {!!imp.customFieldKeys?.length && (
                          <div
                            className="truncate font-mono text-[11px] text-gray-500"
                            title={imp.customFieldKeys.map(varName).join(" ")}
                          >
                            {imp.customFieldKeys.map(varName).join(" ")}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400 max-w-[180px] truncate">{imp.fileName}</td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">
                        {new Date(imp.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {imp.totalRows}
                        {imp.skippedRows > 0 && (
                          <div className="text-[11px] text-gray-500">{imp.skippedRows} skipped</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        {imp.importedRows}
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-600">{imp.duplicateRows}</td>
                      <td className="py-2.5 px-3 text-right text-red-600">{imp.invalidRows}</td>
                      <td className="py-2.5 px-3 text-right">{imp.contactCount ?? 0}</td>
                      <td className="py-2.5 px-3 text-right">{imp.pendingCount ?? 0}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => onViewContacts(imp.id)}
                          className="text-xs font-medium text-[#3B82F6] hover:underline dark:text-[#71C9CE]"
                        >
                          View contacts
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data!.imports.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-gray-500">
                        {search ? "No imports match your search." : "No imports yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Pager page={page} totalPages={totalPages} summary={`${data!.total} imports`} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

function UploadCard() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const finish = (p: ImportProgress) => {
    setProgress(null);
    if (p.error) {
      toast.error(p.error);
    } else if (p.summary) {
      const { imported, duplicate, invalid, skipped } = p.summary;
      const details = `${duplicate} duplicates, ${invalid} invalid${skipped ? `, ${skipped} skipped` : ""}`;
      if (imported > 0) {
        toast.success(`Imported ${imported} contact${imported > 1 ? "s" : ""} (${details})`);
      } else {
        toast.error(`0 contacts imported (${details})`);
      }
    } else {
      toast.success("Import complete");
    }
    qc.invalidateQueries({ queryKey: ["contacts"] });
    qc.invalidateQueries({ queryKey: ["imports"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
  };

  const pollProgress = (jobId: string) => {
    const timer = setInterval(async () => {
      try {
        const p = await contactsApi.progress(jobId);
        setProgress(`Processing ${p.processed}/${p.total}…`);
        if (p.done) {
          clearInterval(timer);
          finish(p);
        }
      } catch {
        clearInterval(timer);
        setProgress(null);
      }
    }, 1000);
  };

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    try {
      const { jobId } = await contactsApi.importFile(file, name.trim() || undefined);
      setName("");
      setFile(null);
      setProgress("Starting import…");
      pollProgress(jobId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Import failed to start");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card>
      <h2 className="font-semibold">Import contacts</h2>
      <form onSubmit={upload} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          className="sm:w-64"
          placeholder="Name this import (optional)"
          aria-label="Import name"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          aria-label="Spreadsheet file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="secondary"
          className="text-xs sm:text-sm max-w-full truncate"
          onClick={() => fileRef.current?.click()}
        >
          {file ? file.name : "Choose file…"}
        </Button>
        <Button type="submit" variant="primary" className="text-xs sm:text-sm" disabled={!file || !!progress}>
          Upload
        </Button>
      </form>

      {progress && (
        <div className="mt-3 rounded-lg bg-[#F1F5F9] border border-[#BAE6FD] px-4 py-2.5 text-sm font-medium text-[#0F172A] dark:bg-blue-950/60 dark:text-blue-300 dark:border-transparent">
          {progress}
        </div>
      )}

      <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
        <p>
          Upload an .xlsx or .csv file (up to 20 MB) with the column names in the first row. Only an email column is
          required; each import becomes its own list, and a campaign sends to one import.
        </p>
        <p>Recognized columns (any capitalization, spaces or underscores):</p>
        <ul className="list-disc pl-5">
          {RECOGNIZED_COLUMNS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p>
          Every other column (up to 20) is kept with the contact and becomes a template variable named after it: a
          column “Industry Type” becomes <code className="font-mono text-xs">{varName("industry_type")}</code>. Built-in
          variables: <span className="font-mono text-xs">{BUILT_IN_VARS.map(varName).join(" ")}</span>.
        </p>
      </div>
    </Card>
  );
}
