import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from './env.js';
import { log } from './log.js';
import * as schema from './schema.js';

/**
 * One pool for the whole process. Mailnex uses the same database, different tables.
 *
 * The server sits at the far end of a Tailscale link, and the work here often pauses for
 * a minute or two while an AI thinks. A connection left idle that long gets dropped
 * somewhere in between, and the next query fails with "connection terminated". So the
 * pool is told to keep its connections alive, to let go of idle ones before they go
 * stale, and a query that fails because the connection died is tried once more.
 */
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,          // let go before anything in between does it for us
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  ssl: env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

// A connection dying in the background is normal here; it must never take the process down.
pool.on('error', (err) => {
  log.warn({ why: err.message }, 'a database connection dropped — the pool will make another');
});

const DIED = /terminated|econnreset|epipe|etimedout|connection closed|socket hang up|not queryable/i;

/**
 * The pool, but a query lost to a dropped connection is tried once more.
 * Everything else — bad SQL, a constraint, a missing table — is passed straight back.
 */
export const db_pool = pool;

type Queryable = typeof pool;

export const query: Queryable['query'] = (async (...args: Parameters<Queryable['query']>) => {
  try {
    return await (pool.query as (...a: unknown[]) => Promise<unknown>)(...args);
  } catch (err) {
    if (!DIED.test(err instanceof Error ? err.message : String(err))) throw err;
    log.warn('the database connection had gone — asking again on a fresh one');
    return await (pool.query as (...a: unknown[]) => Promise<unknown>)(...args);
  }
}) as Queryable['query'];

/** What the rest of the code uses: the pool, with the retry built in. */
export const poolWithRetry = Object.assign(Object.create(pool) as Queryable, { query });

export { poolWithRetry as pool };

export const db = drizzle(pool, { schema });
export { schema };

export async function closeDb(): Promise<void> {
  await pool.end();
}
