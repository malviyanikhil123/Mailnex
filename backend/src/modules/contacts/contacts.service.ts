import * as fs from "node:fs";
import { parseContactsXlsx, type ParsedContact, type ParseResult } from "../../integrations/excel/parser.js";
import { isValidEmail } from "../../utils/email-validator.js";
import { logger } from "../../utils/logger.js";
import { contactsRepo as defaultRepo, ContactsRepo } from "./contacts.repo.js";

export type ImportProgressEntry = {
  processed: number;
  total: number;
  done: boolean;
  summary?: ImportSummaryResult;
  /** Set when the import failed; done is true then and there is no summary. */
  error?: string;
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

const PROGRESS_TTL_MS = 5 * 60 * 1000;

/** The upload is not a readable spreadsheet; the message is shown to the user. */
class UnreadableFileError extends Error {
  constructor() {
    super("Could not read the file. Upload an .xlsx or .csv file.");
  }
}

export class ContactsService {
  constructor(private repo: ContactsRepo) {}

  async importFromFile(
    userId: number,
    filePath: string,
    fileName: string,
    jobId: string,
    name?: string,
  ): Promise<ImportSummaryResult> {
    // Initialize progress entry
    importProgress.set(jobId, { processed: 0, total: 0, done: false });

    try {
      let invalidCount = 0;
      let withinFileDupCount = 0;
      const seenEmails = new Set<string>();
      const validRows: ParsedContact[] = [];
      const allRows: ParsedContact[] = [];

      // Stream all rows into memory first so we can report total
      let parsed: ParseResult;
      try {
        parsed = await parseContactsXlsx(filePath, (row) => {
          allRows.push(row);
        });
      } catch (err) {
        logger.warn({ err, jobId }, "import: could not read the uploaded file");
        throw new UnreadableFileError();
      }
      const totalRows = parsed.total;

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

      // Create the import first so every inserted contact can point at it.
      const importRow = await this.repo.recordImport(userId, {
        name: name?.trim() || null,
        fileName,
        total: totalRows,
        imported: 0,
        skipped: 0,
        duplicate: 0,
        invalid: 0,
        customFieldKeys: parsed.customFieldKeys,
      });

      // Bulk-insert unique valid rows; onConflictDoNothing handles DB-level duplicates
      // (an email already in another import of this user stays in that import).
      let inserted: number;
      try {
        ({ inserted } = await this.repo.bulkInsert(userId, validRows, importRow.id));
      } catch (err) {
        await this.repo.deleteImport(userId, importRow.id).catch(() => {});
        throw err;
      }
      const dbDups = validRows.length - inserted;

      const duplicateCount = withinFileDupCount + dbDups;
      // Rows past the parser's row cap are never read.
      const skippedCount = parsed.skipped;

      const summary: ImportSummaryResult = {
        total: totalRows,
        imported: inserted,
        skipped: skippedCount,
        duplicate: duplicateCount,
        invalid: invalidCount,
      };

      // Persist the final counts on the import record
      await this.repo.updateImportCounts(importRow.id, {
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
      setTimeout(() => importProgress.delete(jobId), PROGRESS_TTL_MS).unref?.();

      return summary;
    } catch (err) {
      // Finish the job so the client stops polling and can show why.
      const current = importProgress.get(jobId);
      importProgress.set(jobId, {
        processed: current?.processed ?? 0,
        total: current?.total ?? 0,
        done: true,
        error: err instanceof UnreadableFileError ? err.message : "Import failed. Please try again.",
      });
      setTimeout(() => importProgress.delete(jobId), PROGRESS_TTL_MS).unref?.();
      throw err;
    } finally {
      // Delete the temp uploaded file on both success and failure
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }
}

// Default singleton using the production repo
export const contactsService = new ContactsService(defaultRepo);
