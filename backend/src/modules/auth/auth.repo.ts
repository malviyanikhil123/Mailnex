import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";

export type UserRow = typeof users.$inferSelect;

export interface AuthRepo {
  findByEmail(email: string): Promise<UserRow | null>;
  findById(id: number): Promise<UserRow | null>;
  setRefreshToken(id: number, hash: string | null): Promise<void>;
  create(data: { name: string; email: string; passwordHash: string }): Promise<UserRow>;
}

export const authRepo: AuthRepo = {
  async findByEmail(email: string) {
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  },

  async findById(id: number) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async setRefreshToken(id: number, hash: string | null) {
    await db.update(users).set({ refreshToken: hash }).where(eq(users.id, id));
  },

  async create(data: { name: string; email: string; passwordHash: string }) {
    const [row] = await db
      .insert(users)
      .values({ name: data.name, email: data.email, passwordHash: data.passwordHash })
      .returning();
    return row;
  },
};
