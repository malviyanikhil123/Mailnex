import * as fs from "node:fs";
import { parseContactsXlsx } from "../../integrations/excel/parser.js";
import { isValidEmail } from "../../utils/email-validator.js";
import { contactsRepo as defaultRepo, ContactsRepo } from "./contacts.repo.js";

export type ImportProgressEntry = {
  processed: number;
  total: number;
  done: boolean;
  summary?: ImportSummaryResult;
};

export type ImportSummaryResult = {
  total: number;
  imported: number;
  skipped: number;
  duplicate: number;
  invalid: number;
};

/**
 * In-memory progress map keyed by jobId.
 * Exported so the controller's progress endpoint and tests can read it.
 */
export const importProgress = new Map<string, ImportProgressEntry>();

export class ContactsService {
  constructor(private repo: ContactsRepo) {}

  async importFromFile(
    filePath: string,
    fileName: string,
    jobId: string,
  ): Promise<ImportSummaryResult> {
    // Initialize progress entry
    importProgress.set(jobId, { processed: 0, total: 0, done: false });

    try {
      let invalidCount = 0;
      let withinFileDupCount = 0;
      const seenEmails = new Set<string>();
      const validRows: Array<{ companyName: string; location: string; email: string }> = [];
      const allRows: Array<{ companyName: string; location: string; email: string }> = [];

      // Stream all rows into memory first so we can report total
      const totalRows = await parseContactsXlsx(filePath, (row) => {
        allRows.push(row);
      });

      // Update total in progress
      importProgress.set(jobId, { processed: 0, total: totalRows, done: false });

      // Validate and deduplicate within file
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];

        importProgress.set(jobId, {
          processed: i + 1,
          total: totalRows,
          done: false,
        });

        if (!isValidEmail(row.email)) {
          invalidCount++;
          continue;
        }

        if (seenEmails.has(row.email)) {
          // Duplicate within this file — count separately
          withinFileDupCount++;
          continue;
        }

        seenEmails.add(row.email);
        validRows.push(row);
      }

      // Bulk-insert unique valid rows; onConflictDoNothing handles DB-level duplicates.
      // inserted = rows actually written to DB.
      // dbDups = valid unique-in-file rows that already existed in DB.
      const { inserted } = await this.repo.bulkInsert(validRows);
      const dbDups = validRows.length - inserted;

      /**
       * Duplicate counting semantics:
       *   withinFileDupCount  — same email appeared more than once in this upload file
       *   dbDups              — email was unique in this file but already in the database
       *   duplicateCount      — total duplicates = both combined
       */
      const duplicateCount = withinFileDupCount + dbDups;
      const skippedCount = 0; // nothing skipped beyond invalid/duplicate

      const summary: ImportSummaryResult = {
        total: totalRows,
        imported: inserted,
        skipped: skippedCount,
        duplicate: duplicateCount,
        invalid: invalidCount,
      };

      // Persist import record
      await this.repo.recordImport({
        fileName,
        total: totalRows,
        imported: inserted,
        skipped: skippedCount,
        duplicate: duplicateCount,
        invalid: invalidCount,
      });

      // Mark progress done with full summary; schedule eviction after 5 minutes
      importProgress.set(jobId, {
        processed: totalRows,
        total: totalRows,
        done: true,
        summary,
      });
      setTimeout(() => importProgress.delete(jobId), 5 * 60 * 1000).unref?.();

      return summary;
    } finally {
      // Delete the temp uploaded file on both success and failure
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }
}

// Default singleton using the production repo
export const contactsService = new ContactsService(defaultRepo);
