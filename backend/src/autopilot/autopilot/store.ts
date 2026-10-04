import { sql } from 'drizzle-orm';
import { db, schema } from '../shared/db.js';
import type { NormalJob } from './normalize.js';

export type StoreResult = { added: number; seenAgain: number; duplicates: number };

/**
 * Four layers of duplicate checking, cheapest first:
 *   1. same URL          → already stored, just touch last_seen_at
 *   2. same fingerprint  → same job from another source, skip
 *   3. (meaning match)   → added in Phase 2 with pgvector
 *   4. (company cooldown)→ added when applying starts
 */
export async function storeJobs(jobs: NormalJob[]): Promise<StoreResult> {
  const result: StoreResult = { added: 0, seenAgain: 0, duplicates: 0 };

  for (const job of jobs) {
    const existing = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(sql`${schema.jobs.url} = ${job.url}`)
      .limit(1);

    if (existing[0]) {
      await db.update(schema.jobs).set({ lastSeenAt: new Date() }).where(sql`${schema.jobs.id} = ${existing[0].id}`);
      result.seenAgain++;
      continue;
    }

    const clash = await db
      .select({ id: schema.fingerprints.jobId })
      .from(schema.fingerprints)
      .where(sql`${schema.fingerprints.fingerprint} = ${job.fingerprint}`)
      .limit(1);

    if (clash[0]) {
      await db.insert(schema.events).values({
        jobId: clash[0].id,
        agent: 'Cleaner',
        message: `Same job also on ${job.sourceKey} — kept the first one`,
      });
      result.duplicates++;
      continue;
    }

    const company = await upsertCompany(job);
    const inserted = await db
      .insert(schema.jobs)
      .values({
        companyId: company,
        title: job.title,
        companyName: job.companyName,
        location: job.location ?? null,
        country: job.country,
        remote: job.remote,
        description: job.description ?? null,
        url: job.url,
        applyKind: job.applyKind ?? null,
        salaryText: job.salaryText ?? null,
        postedAt: job.postedAt ?? null,
        roleMatch: job.roleMatch ?? false,
        sourceKey: job.sourceKey,
        sourceJobId: job.sourceJobId ?? null,
        raw: job.raw ?? null,
      })
      .returning({ id: schema.jobs.id });

    const jobId = inserted[0]!.id;
    await db.insert(schema.fingerprints).values({ jobId, fingerprint: job.fingerprint }).onConflictDoNothing();
    await db.insert(schema.events).values({
      jobId,
      agent: 'Scout',
      message: `Found "${job.title}" at ${job.companyName} · ${job.sourceKey}`,
    });
    result.added++;
  }

  return result;
}

async function upsertCompany(job: NormalJob): Promise<number | null> {
  if (!job.companySlug) return null;
  const found = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(sql`${schema.companies.slug} = ${job.companySlug}`)
    .limit(1);
  if (found[0]) return found[0].id;

  const made = await db
    .insert(schema.companies)
    .values({ name: job.companyName, slug: job.companySlug, atsKind: job.applyKind ?? null })
    .onConflictDoNothing()
    .returning({ id: schema.companies.id });
  return made[0]?.id ?? null;
}

export async function recordRun(key: string, label: string, kind: string, found: number, added: number, outcome: string): Promise<void> {
  await db
    .insert(schema.sources)
    .values({ key, label, kind, found, added, lastRunAt: new Date(), lastResult: outcome })
    .onConflictDoUpdate({
      target: schema.sources.key,
      set: { found, added, lastRunAt: new Date(), lastResult: outcome, label, kind },
    });
}

/**
 * The scheduler's own book-keeping. A row is opened the moment a run starts, so a run
 * that is killed half way through still leaves a trace — it simply never gets an end.
 */
export async function startRun(kind: string): Promise<number> {
  const made = await db.insert(schema.runs).values({ kind, startedAt: new Date() }).returning({ id: schema.runs.id });
  return made[0]!.id;
}

export async function finishRun(id: number, outcome: { ok: boolean; found?: number; added?: number; note?: string | null }): Promise<void> {
  await db
    .update(schema.runs)
    .set({
      finishedAt: new Date(),
      ok: outcome.ok,
      found: outcome.found ?? 0,
      added: outcome.added ?? 0,
      note: outcome.note?.slice(0, 500) ?? null,
    })
    .where(sql`${schema.runs.id} = ${id}`);
}
