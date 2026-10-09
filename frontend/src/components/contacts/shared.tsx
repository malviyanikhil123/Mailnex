import { Button } from "../ui/primitives";
import type { Contact } from "../../types/api";

export const selectClass =
  "rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100";

export const tableHeadClass = "text-left text-gray-700 text-xs uppercase bg-[#BAE6FD] dark:bg-gray-800/50";

export const tableRowClass =
  "border-t border-[#BAE6FD]/60 dark:border-gray-800 hover:bg-[#E0F2FE] dark:hover:bg-gray-800/30";

/** "First Last", falling back to the legacy single-name field. */
export function contactName(c: Pick<Contact, "firstName" | "lastName" | "contactPerson">): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.contactPerson || "";
}

/** Template variable as shown to the user, e.g. {{job_title}}. */
export function varName(key: string): string {
  return `{{${key}}}`;
}

export function Pager({
  page,
  totalPages,
  summary,
  onPage,
}: {
  page: number;
  totalPages: number;
  summary: string;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm border-t border-[#BAE6FD]/60 pt-3 dark:border-gray-800">
      <span className="text-gray-500 text-xs sm:text-sm">{summary}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="text-xs py-1 px-2.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <span className="text-xs sm:text-sm font-medium px-2">
          {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          className="text-xs py-1 px-2.5"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
