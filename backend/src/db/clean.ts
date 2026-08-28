import { db, pool } from "./index.js";
import { sql } from "drizzle-orm";

export async function cleanDatabase() {
  console.log("🧹 Completely wiping and cleaning all database tables...");

  // Truncate all tables and reset ID sequences
  await db.execute(
    sql`TRUNCATE TABLE 
      email_logs, 
      campaign_queue, 
      daily_quota, 
      contacts_imports, 
      contacts, 
      email_templates, 
      campaign_settings, 
      app_settings, 
      users 
      RESTART IDENTITY CASCADE;`
  );

  console.log("✨ All tables truncated. 0 users, 0 contacts, 0 logs, 0 data remaining.");
  console.log("🎉 Database is 100% clean and ready for new users to register!");
}

cleanDatabase()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Clean failed:", err);
    await pool.end();
    process.exit(1);
  });
