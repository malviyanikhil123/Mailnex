import { and, desc, eq, lt, notInArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { authSessions, users } from "../../db/schema/index.js";

export type UserRow = typeof users.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type NewAuthSession = Pick<
  typeof authSessions.$inferInsert,
  "id" | "userId" | "tokenHash" | "rememberMe" | "expiresAt" | "userAgent"
>;

export interface AuthRepo {
  /** Users whose email matches case-insensitively, oldest first. More than one only for
   *  accounts differing by case alone, created before emails were lower-cased. */
  listByEmail(email: string, limit: number): Promise<UserRow[]>;
  findById(id: number): Promise<UserRow | null>;
  /** Legacy single refresh-token slot; only cleared now, once its token becomes a session. */
  setRefreshToken(id: number, hash: string | null): Promise<void>;
  /** Clears the legacy slot only if it still holds `hash`; false when another request did it first. */
  takeRefreshToken(id: number, hash: string): Promise<boolean>;
  create(data: { name: string; email: string; passwordHash: string }): Promise<UserRow>;

  findSession(id: string): Promise<AuthSessionRow | null>;
  createSession(data: NewAuthSession): Promise<void>;
  /** Swaps the token hash only if it still equals `currentHash`, so two refreshes racing with
   *  the same token can't both win. Returns false when the other one rotated it first. */
  rotateSession(id: string, currentHash: string, next: { tokenHash: string; expiresAt: Date }): Promise<boolean>;
  deleteSession(id: string, userId: number): Promise<void>;
  /** Deletes the user's expired sessions, then their least recently used ones beyond `keep`. */
  pruneSessions(userId: number, keep: number): Promise<void>;
}

export const authRepo: AuthRepo = {
  async listByEmail(email: string, limit: number) {
    return db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .orderBy(users.id)
      .limit(limit);
  },

  async findById(id: number) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async setRefreshToken(id: number, hash: string | null) {
    await db.update(users).set({ refreshToken: hash }).where(eq(users.id, id));
  },

  async takeRefreshToken(id: number, hash: string) {
    const rows = await db
      .update(users)
      .set({ refreshToken: null })
      .where(and(eq(users.id, id), eq(users.refreshToken, hash)))
      .returning({ id: users.id });
    return rows.length > 0;
  },

  async create(data: { name: string; email: string; passwordHash: string }) {
    const [row] = await db
      .insert(users)
      .values({ name: data.name, email: data.email, passwordHash: data.passwordHash })
      .returning();
    return row;
  },

  async findSession(id: string) {
    const rows = await db.select().from(authSessions).where(eq(authSessions.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async createSession(data: NewAuthSession) {
    // Timestamps from the app clock, like expiresAt, so they compare cleanly with it.
    const now = new Date();
    await db.insert(authSessions).values({ ...data, createdAt: now, lastUsedAt: now });
  },

  async rotateSession(id, currentHash, next) {
    const rows = await db
      .update(authSessions)
      .set({ ...next, lastUsedAt: new Date() })
      .where(and(eq(authSessions.id, id), eq(authSessions.tokenHash, currentHash)))
      .returning({ id: authSessions.id });
    return rows.length > 0;
  },

  async deleteSession(id: string, userId: number) {
    await db.delete(authSessions).where(and(eq(authSessions.id, id), eq(authSessions.userId, userId)));
  },

  async pruneSessions(userId: number, keep: number) {
    await db.delete(authSessions).where(and(eq(authSessions.userId, userId), lt(authSessions.expiresAt, new Date())));
    const newest = db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, userId))
      .orderBy(desc(authSessions.lastUsedAt))
      .limit(keep);
    await db.delete(authSessions).where(and(eq(authSessions.userId, userId), notInArray(authSessions.id, newest)));
  },
};
