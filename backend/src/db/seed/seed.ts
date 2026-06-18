/**
 * Main seed orchestrator.
 * Run: npm run db:seed
 *
 * Idempotent — each insert uses onConflictDoNothing so re-running is safe.
 * Requires a live DATABASE_URL in environment (or .env file).
 */
import postgres from "postgres";
import { db } from "../index.js";
import { emailTemplates, appSettings, campaignSettings } from "../schema/index.js";
import { TEMPLATE_SEED } from "./templates.js";
import { CANDIDATE_PLACEHOLDER } from "./settings.js";
import { seedAdmin } from "./admin.js";

async function seedTemplates(): Promise<number> {
  const rows = TEMPLATE_SEED.map((t) => ({ ...t }));
  await db.insert(emailTemplates).values(rows).onConflictDoNothing();
  return rows.length;
}

async function seedSettings(): Promise<void> {
  await db
    .insert(appSettings)
    .values({
      candidateProfile: JSON.stringify(CANDIDATE_PLACEHOLDER),
    })
    .onConflictDoNothing();
  console.log("  ✔ appSettings row seeded");
}

async function seedCampaignSettings(): Promise<void> {
  await db
    .insert(campaignSettings)
    .values({
      // All columns have schema defaults; just insert one row
    })
    .onConflictDoNothing();
  console.log("  ✔ campaignSettings row seeded");
}

async function main(): Promise<void> {
  console.log("Seeding database…");

  const templateCount = await seedTemplates();
  console.log(`  ✔ ${templateCount} templates seeded`);

  await seedAdmin();
  await seedSettings();
  await seedCampaignSettings();

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
