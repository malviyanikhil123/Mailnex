/**
 * Multi-user migration script.
 * Adds user_id columns to all data tables, assigns existing data to the first admin user,
 * deduplicates settings rows, drops old unique constraints, creates new composite ones.
 *
 * Run: npx tsx src/db/seed/migration-multiuser.ts
 */
import { db } from "../index.js";
import { users } from "../schema/index.js";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Starting multi-user migration…");

  // 1. Find the first (admin) user to assign existing data to
  const [admin] = await db.select({ id: users.id }).from(users).limit(1);
  if (!admin) {
    console.error("No user found! Please seed an admin user first.");
    process.exit(1);
  }
  const adminId = admin.id;
  console.log(`  Using admin user id=${adminId} for existing data`);

  // 2. Add user_id columns
  const tables = [
    "contacts",
    "email_templates",
    "app_settings",
    "campaign_settings",
    "campaign_queue",
    "email_logs",
    "daily_quota",
    "contacts_imports",
  ];

  for (const table of tables) {
    await db.execute(sql.raw(`
      DO $$ BEGIN
        ALTER TABLE ${table} ADD COLUMN user_id INTEGER;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END $$;
    `));
    await db.execute(sql.raw(`UPDATE ${table} SET user_id = ${adminId} WHERE user_id IS NULL`));
    await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN user_id SET NOT NULL`));
    await db.execute(sql.raw(`
      DO $$ BEGIN
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_user_id_users_id_fk
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `));
    console.log(`  ✔ ${table}: user_id column configured`);
  }

  // 3. Deduplicate app_settings & campaign_settings for admin
  await db.execute(sql.raw(`
    DELETE FROM app_settings WHERE id NOT IN (
      SELECT id FROM app_settings ORDER BY updated_at DESC LIMIT 1
    );
  `));
  await db.execute(sql.raw(`
    DELETE FROM campaign_settings WHERE id NOT IN (
      SELECT id FROM campaign_settings ORDER BY updated_at DESC LIMIT 1
    );
  `));

  // 4. Drop old unique constraints and create new composite ones
  await db.execute(sql.raw(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_unique`));
  await db.execute(sql.raw(`DROP INDEX IF EXISTS contacts_email_user_id_unique`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_user_id_unique ON contacts(email, user_id)`));
  console.log("  ✔ contacts: unique constraint updated to (email, user_id)");

  await db.execute(sql.raw(`DROP INDEX IF EXISTS email_templates_name_category_unique`));
  await db.execute(sql.raw(`DROP INDEX IF EXISTS email_templates_name_category_user_unique`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS email_templates_name_category_user_unique ON email_templates(name, category, user_id)`));
  console.log("  ✔ email_templates: unique constraint updated to (name, category, user_id)");

  await db.execute(sql.raw(`DROP INDEX IF EXISTS app_settings_user_id_unique`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS app_settings_user_id_unique ON app_settings(user_id)`));
  console.log("  ✔ app_settings: unique constraint on user_id");

  await db.execute(sql.raw(`DROP INDEX IF EXISTS campaign_settings_user_id_unique`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS campaign_settings_user_id_unique ON campaign_settings(user_id)`));
  console.log("  ✔ campaign_settings: unique constraint on user_id");

  await db.execute(sql.raw(`ALTER TABLE daily_quota DROP CONSTRAINT IF EXISTS daily_quota_date_unique`));
  await db.execute(sql.raw(`DROP INDEX IF EXISTS daily_quota_date_user_id_unique`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS daily_quota_date_user_id_unique ON daily_quota(date, user_id)`));
  console.log("  ✔ daily_quota: unique constraint updated to (date, user_id)");

  console.log("Multi-user migration complete!");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
