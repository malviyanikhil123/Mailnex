import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
export const contactsImports = pgTable("contacts_imports", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  importedRows: integer("imported_rows").notNull().default(0),
  skippedRows: integer("skipped_rows").notNull().default(0),
  duplicateRows: integer("duplicate_rows").notNull().default(0),
  invalidRows: integer("invalid_rows").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
