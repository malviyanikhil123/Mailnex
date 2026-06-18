import bcrypt from "bcryptjs";
import { db } from "../index.js";
import { users } from "../schema/index.js";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Admin";

export async function seedAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await db
    .insert(users)
    .values({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
    })
    .onConflictDoNothing();
  console.log(`  ✔ admin user seeded (${ADMIN_EMAIL})`);
}
