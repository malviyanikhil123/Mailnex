import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { pool } from '../shared/db.js';
import { env } from '../shared/env.js';

/**
 * Login is Mailnex's login. Same users table, same password hashes, same JWT secret —
 * so one account opens both apps. Autopilot only adds its own on/off flag.
 */

export type Me = { id: number; name: string; email: string; role: string; enabled: boolean };

/**
 * An error whose words are meant for the person reading the screen. Anything else
 * — a database saying it cannot be reached, a driver complaining about a byte —
 * is ours to fix and must never be handed to a stranger.
 */
export class Refused extends Error {}

/** Checks a password against whatever hash Mailnex stored. */
async function passwordMatches(password: string, hash: string): Promise<boolean> {
  if (/^\$2[aby]\$/.test(hash)) return bcrypt.compare(password, hash);
  throw new Refused('This account uses a password format Autopilot does not know yet');
}

export async function signIn(email: string, password: string): Promise<{ token: string; me: Me } | null> {
  const found = await pool.query<{ id: number; name: string; email: string; password_hash: string }>(
    'SELECT id, name, email, password_hash FROM users WHERE lower(email) = lower($1) LIMIT 1',
    [email.trim()],
  );
  const user = found.rows[0];
  if (!user) return null;
  if (!(await passwordMatches(password, user.password_hash))) return null;

  // First login to Autopilot enrols the person; after that we just say hello.
  const flag = await pool.query<{ enabled: boolean; role: string }>(
    `INSERT INTO autopilot_users (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now()
     RETURNING enabled, role`,
    [user.id],
  );

  const token = jwt.sign({ sub: String(user.id), email: user.email }, env.JWT_SECRET, { expiresIn: '7d' });
  const { enabled, role } = flag.rows[0] ?? { enabled: true, role: 'member' };
  return { token, me: { id: user.id, name: user.name, email: user.email, enabled, role } };
}

/**
 * Mailnex hashes its passwords at cost 12 and every row in the table is $2a$12$,
 * so anything made here matches. Compare reads the cost out of the hash, which is
 * why both apps can check a password either app set.
 */
const HASH_COST = 12;
const SHORTEST_PASSWORD = 10;
const LONGEST_NAME = 200;
const LONGEST_EMAIL = 254;   // the longest address the mail standards allow

/** A stray 0x00 is not text to Postgres, and no person ever typed one. */
const withoutNulls = (s: string) => s.replace(/\u0000/g, '');

/**
 * Makes a Mailnex account and switches Autopilot on for it. Only a row is added;
 * the users table itself is Mailnex's and is never altered.
 */
export async function signUp(name: string, email: string, password: string): Promise<{ token: string; me: Me }> {
  const cleanName = name.trim();
  const cleanEmail = email.trim();
  if (!cleanName) throw new Error('Please tell us your name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('That does not look like an email address');
  if (password.length < SHORTEST_PASSWORD) throw new Error(`Please use at least ${SHORTEST_PASSWORD} characters in your password`);

  // Checked here for a kind message, and again by the database, which is what
  // actually stops two people claiming one address at the same moment.
  const taken = await pool.query('SELECT 1 FROM users WHERE lower(email) = lower($1) LIMIT 1', [cleanEmail]);
  if (taken.rowCount) throw new Error('There is already an account with that email — try signing in instead');

  const hash = await bcrypt.hash(password, HASH_COST);
  let created;
  try {
    created = await pool.query<{ id: number; name: string; email: string }>(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [cleanName, cleanEmail, hash],
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new Error('There is already an account with that email — try signing in instead');
    throw err;
  }
  const user = created.rows[0];
  if (!user) throw new Error('The account could not be created — please try again');

  const flag = await pool.query<{ enabled: boolean; role: string }>(
    `INSERT INTO autopilot_users (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now()
     RETURNING enabled, role`,
    [user.id],
  );

  const token = jwt.sign({ sub: String(user.id), email: user.email }, env.JWT_SECRET, { expiresIn: '7d' });
  const { enabled, role } = flag.rows[0] ?? { enabled: true, role: 'member' };
  return { token, me: { id: user.id, name: user.name, email: user.email, enabled, role } };
}

export async function whoIs(token?: string): Promise<Me | null> {
  if (!token) return null;
  let id: number;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string; id?: number; userId?: number };
    id = Number(payload.sub ?? payload.id ?? payload.userId);
  } catch {
    return null;
  }
  if (!Number.isFinite(id)) return null;
  const row = await pool.query<Me>(
    `SELECT u.id, u.name, u.email,
            COALESCE(a.role, 'member') AS role,
            COALESCE(a.enabled, false) AS enabled
       FROM users u LEFT JOIN autopilot_users a ON a.user_id = u.id
      WHERE u.id = $1`,
    [id],
  );
  return row.rows[0] ?? null;
}

/** Guard for every private route. */
export async function mustBeSignedIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.autopilot
    ?? req.headers.authorization?.replace(/^Bearer /i, '');
  const me = await whoIs(token);
  if (!me) { res.status(401).json({ error: 'Please sign in' }); return; }
  if (!me.enabled) { res.status(403).json({ error: 'This account is not switched on for Autopilot' }); return; }
  (req as Request & { me?: Me }).me = me;
  next();
}
