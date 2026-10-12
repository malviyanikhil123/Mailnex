import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contactsApi } from "../../services/contacts.api";
import { Button, Card, Input, Spinner, ErrorState, StatusBadge } from "../ui/primitives";
import { toast } from "../../store/toast";
import type { Contact, ContactStatus } from "../../types/api";
import { contactsToCsv, downloadCsv } from "./csv";
import { Pager, contactName, filterSelectClass, tableHeadClass, tableRowClass, varName } from "./shared";

const STATUSES: ContactStatus[] = ["PENDING", "PROCESSING", "SENT", "FAILED", "BOUNCED", "PAUSED"];
const COLUMNS = 8;

/** Contact list with its own search / status / import filters. The import filter lives in the URL. */
export default function ContactsTab({
  importId,
  onImportChange,
}: {
  importId?: number;
  onImportChange: (importId?: number) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const limit = 20;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["contacts", search, status, importId, page],
    queryFn: () =>
      contactsApi.list({ search: search || undefined, status: status || undefined, importId, page, limit }),
    refetchInterval: 4000,
  });
  const imports = useQuery({ queryKey: ["imports"], queryFn: contactsApi.imports });
  const importNames = new Map(imports.data?.map((i) => [i.id, i.name || i.fileName]));

  const del = useMutation({
    mutationFn: (id: number) => contactsApi.remove(id),
    onSuccess: () => {
      toast.success("Contact deleted");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to delete contact");
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Input
            placeholder="Search name, email or company…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={filterSelectClass}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Import"
          value={importId ?? ""}
          onChange={(e) => {
            onImportChange(e.target.value ? +e.target.value : undefined);
            setPage(1);
          }}
          className={filterSelectClass}
        >
          <option value="">All imports</option>
          {imports.data?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name || i.fileName} ({i.contactCount ?? 0})
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          className="text-xs sm:text-sm"
          disabled={!data?.rows.length}
          onClick={() => data && downloadCsv("contacts.csv", contactsToCsv(data.rows))}
        >
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState message="Failed to load contacts." />
      ) : (
        <>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[800px]">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Company</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Import</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((c) => {
                  const fields = detailFields(c);
                  const open = openId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr className={tableRowClass}>
                        <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-gray-100">
                          {contactName(c) || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{c.email}</td>
                        <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">{c.companyName || "—"}</td>
                        <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{c.phone || "—"}</td>
                        <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">{c.location || "—"}</td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400 max-w-[160px] truncate">
                          {(c.importId != null && importNames.get(c.importId)) || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {fields.length > 0 && (
                            <button
                              aria-expanded={open}
                              onClick={() => setOpenId(open ? null : c.id)}
                              className="mr-3 text-xs font-medium text-[#3B82F6] hover:underline dark:text-[#71C9CE]"
                            >
                              {open ? "Hide fields" : `Fields (${fields.length})`}
                            </button>
                          )}
                          <button
                            onClick={() => confirm("Delete this contact?") && del.mutate(c.id)}
                            className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-[#E0F2FE]/50 dark:bg-gray-800/20">
                          <td colSpan={COLUMNS} className="px-3 pb-3 pt-1">
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                              {fields.map(([key, value]) => (
                                <div key={key} className="flex min-w-0 gap-2">
                                  <dt className="shrink-0 font-mono text-gray-500">{varName(key)}</dt>
                                  <dd className="truncate text-gray-800 dark:text-gray-200" title={value}>
                                    {value || "—"}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {data!.rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS} className="py-8 text-center text-gray-500">
                      No contacts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pager page={page} totalPages={totalPages} summary={`${data!.total} total contacts`} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

/** Values not shown as table columns, as template variable → value. */
function detailFields(c: Contact): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  if (c.website) fields.push(["contact_website", c.website]);
  return fields.concat(Object.entries(c.customFields ?? {}));
}
