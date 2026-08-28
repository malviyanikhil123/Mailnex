import bcrypt from "bcryptjs";
import { db } from "../index.js";
import { users } from "../schema/index.js";

export async function seedAdmin(
  email = process.env.SEED_ADMIN_EMAIL || "admin@example.com",
  password = process.env.SEED_ADMIN_PASSWORD || "Admin@123",
  name = "Admin"
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash,
    })
    .onConflictDoNothing();
}
