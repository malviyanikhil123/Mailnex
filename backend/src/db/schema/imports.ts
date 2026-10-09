import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users.js";
export const contactsImports = pgTable("contacts_imports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name"),
  fileName: text("file_name").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  importedRows: integer("imported_rows").notNull().default(0),
  skippedRows: integer("skipped_rows").notNull().default(0),
  duplicateRows: integer("duplicate_rows").notNull().default(0),
  invalidRows: integer("invalid_rows").notNull().default(0),
  // Keys of the extra columns this import stored on its contacts (contacts.custom_fields).
  customFieldKeys: jsonb("custom_field_keys").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
