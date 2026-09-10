import { db } from "../../db/index.js";
import { discoveryJobs, discoveredLeads } from "../../db/schema/lead-discovery.js";
import { contacts } from "../../db/schema/contacts.js";
import { and, eq, desc, ilike, or, count, inArray, gte, sql } from "drizzle-orm";
import type {
  CreateDiscoveryJobInput,
  ListLeadsQuery,
  DiscoveryStats,
  DiscoveryMetricSet,
} from "./lead-discovery.types.js";

export type DiscoveryJobRecord = typeof discoveryJobs.$inferSelect;
export type DiscoveredLeadRecord = typeof discoveredLeads.$inferSelect;

export interface LeadInsertItem {
  jobId: number;
  email: string;
  normalizedEmail: string;
  name?: string;
  companyName?: string;
  companyDomain?: string;
  companyType?: string;
  industry?: string;
  location?: string;
  emailCategory: string;
  classificationConfidence: number;
  sourceUrl?: string;
  isDuplicate?: boolean;
}

export class LeadDiscoveryRepo {
  async createJob(userId: number, input: CreateDiscoveryJobInput): Promise<DiscoveryJobRecord> {
    const [row] = await db
      .insert(discoveryJobs)
      .values({
        userId,
        location: input.location || "India",
        profession: input.profession || "IT",
        keywords: input.keywords || "",
        companyType: input.companyType || "IT",
        targetCount: input.targetCount || 50,
        status: "QUEUED",
        progress: 0,
        startedAt: new Date(),
      })
      .returning();
    return row;
  }

  async getJobById(userId: number, jobId: number): Promise<DiscoveryJobRecord | null> {
    const [row] = await db
      .select()
      .from(discoveryJobs)
      .where(and(eq(discoveryJobs.id, jobId), eq(discoveryJobs.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async updateJob(jobId: number, data: Partial<DiscoveryJobRecord>): Promise<DiscoveryJobRecord | null> {
    const [row] = await db
      .update(discoveryJobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(discoveryJobs.id, jobId))
      .returning();
    return row ?? null;
  }

  async listJobs(userId: number, limit = 20): Promise<DiscoveryJobRecord[]> {
    return db
      .select()
      .from(discoveryJobs)
      .where(eq(discoveryJobs.userId, userId))
      .orderBy(desc(discoveryJobs.createdAt))
      .limit(limit);
  }

  async deleteJob(userId: number, jobId: number): Promise<boolean> {
    const [deleted] = await db
      .delete(discoveryJobs)
      .where(and(eq(discoveryJobs.id, jobId), eq(discoveryJobs.userId, userId)))
      .returning({ id: discoveryJobs.id });
    return !!deleted;
  }

  async getExistingEmails(userId: number, normalizedEmails: string[]): Promise<Set<string>> {
    if (normalizedEmails.length === 0) return new Set();

    const [discoveredRows, contactRows] = await Promise.all([
      db
        .select({ email: discoveredLeads.normalizedEmail })
        .from(discoveredLeads)
        .where(
          and(
            eq(discoveredLeads.userId, userId),
            inArray(discoveredLeads.normalizedEmail, normalizedEmails)
          )
        ),
      db
        .select({ email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.userId, userId), inArray(contacts.email, normalizedEmails))),
    ]);

    const set = new Set<string>();
    for (const r of discoveredRows) set.add(r.email.toLowerCase());
    for (const r of contactRows) set.add(r.email.toLowerCase());
    return set;
  }

  async insertLeads(userId: number, items: LeadInsertItem[]): Promise<number> {
    if (items.length === 0) return 0;

    const values = items.map((item) => ({
      userId,
      jobId: item.jobId,
      email: item.email,
      normalizedEmail: item.normalizedEmail,
      name: item.name || null,
      companyName: item.companyName || null,
      companyDomain: item.companyDomain || null,
      companyType: item.companyType || "IT",
      industry: item.industry || null,
      location: item.location || null,
      emailCategory: item.emailCategory,
      classificationConfidence: item.classificationConfidence,
      sourceUrl: item.sourceUrl || null,
      isDuplicate: !!item.isDuplicate,
      isValid: true,
      isImported: false,
    }));

    const rows = await db.insert(discoveredLeads).values(values).returning({ id: discoveredLeads.id });
    return rows.length;
  }

  async listLeads(userId: number, query: ListLeadsQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(discoveredLeads.userId, userId)];

    if (query.jobId) {
      conditions.push(eq(discoveredLeads.jobId, query.jobId));
    }
    if (query.emailCategory && query.emailCategory !== "All") {
      conditions.push(eq(discoveredLeads.emailCategory, query.emailCategory));
    }
    if (query.companyType && query.companyType !== "All") {
      conditions.push(eq(discoveredLeads.companyType, query.companyType));
    }
    if (query.isImported !== undefined) {
      conditions.push(eq(discoveredLeads.isImported, query.isImported));
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(discoveredLeads.email, `%${query.search}%`),
          ilike(discoveredLeads.companyName, `%${query.search}%`),
          ilike(discoveredLeads.companyDomain, `%${query.search}%`),
          ilike(discoveredLeads.location, `%${query.search}%`)
        )!
      );
    }

    const where = and(...conditions);

    const [rows, totalResult] = await Promise.all([
      db.select().from(discoveredLeads).where(where).orderBy(desc(discoveredLeads.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(discoveredLeads).where(where),
    ]);

    return {
      rows,
      total: Number(totalResult[0]?.total ?? 0),
      page,
      limit,
    };
  }

  async importLeadsToContacts(userId: number, leadIds: number[]): Promise<{ imported: number; skipped: number }> {
    if (leadIds.length === 0) return { imported: 0, skipped: 0 };

    const selectedLeads = await db
      .select()
      .from(discoveredLeads)
      .where(and(eq(discoveredLeads.userId, userId), inArray(discoveredLeads.id, leadIds)));

    if (selectedLeads.length === 0) return { imported: 0, skipped: 0 };

    let importedCount = 0;

    for (const lead of selectedLeads) {
      try {
        // Insert into contacts if not duplicate
        const [insertedContact] = await db
          .insert(contacts)
          .values({
            userId,
            companyName: lead.companyName || lead.companyDomain || "Discovered Lead",
            location: lead.location || "India",
            email: lead.normalizedEmail,
            contactPerson: lead.name || (lead.emailCategory !== "General" ? lead.emailCategory : null),
            status: "PENDING",
          })
          .onConflictDoNothing()
          .returning({ id: contacts.id });

        if (insertedContact) {
          importedCount++;
          await db
            .update(discoveredLeads)
            .set({ isImported: true, importedContactId: insertedContact.id, updatedAt: new Date() })
            .where(eq(discoveredLeads.id, lead.id));
        } else {
          // Already in contacts
          await db
            .update(discoveredLeads)
            .set({ isImported: true, updatedAt: new Date() })
            .where(eq(discoveredLeads.id, lead.id));
        }
      } catch {}
    }

    return {
      imported: importedCount,
      skipped: selectedLeads.length - importedCount,
    };
  }

  async getStats(userId: number): Promise<DiscoveryStats> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOf7Days = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOf30Days = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [allJobs, allLeads] = await Promise.all([
      db
        .select()
        .from(discoveryJobs)
        .where(and(eq(discoveryJobs.userId, userId), gte(discoveryJobs.createdAt, startOf30Days))),
      db
        .select()
        .from(discoveredLeads)
        .where(and(eq(discoveredLeads.userId, userId), gte(discoveredLeads.createdAt, startOf30Days))),
    ]);

    const buildMetricSet = (since: Date, until?: Date): DiscoveryMetricSet => {
      const filteredJobs = allJobs.filter((j) => {
        const t = new Date(j.createdAt).getTime();
        return t >= since.getTime() && (!until || t < until.getTime());
      });

      const filteredLeads = allLeads.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        return t >= since.getTime() && (!until || t < until.getTime());
      });

      const companiesFound = filteredJobs.reduce((acc, j) => acc + j.companiesFound, 0);
      const pagesCrawled = filteredJobs.reduce((acc, j) => acc + j.pagesCrawled, 0);
      const duplicatesRemoved = filteredJobs.reduce((acc, j) => acc + j.duplicatesRemoved, 0);

      let hrCount = 0;
      let itCount = 0;
      let accountsCount = 0;
      let otherCount = 0;

      for (const lead of filteredLeads) {
        if (lead.emailCategory === "HR" || lead.emailCategory === "Recruitment" || lead.emailCategory === "Careers") {
          hrCount++;
        } else if (lead.emailCategory === "IT") {
          itCount++;
        } else if (lead.emailCategory === "Accounts" || lead.emailCategory === "Finance") {
          accountsCount++;
        } else {
          otherCount++;
        }
      }

      return {
        companiesFound,
        pagesCrawled,
        emailsFound: filteredLeads.length,
        hrEmailsFound: hrCount,
        itEmailsFound: itCount,
        accountsEmailsFound: accountsCount,
        otherEmailsFound: otherCount,
        duplicatesRemoved,
      };
    };

    // Build 7-day daily trend
    const dailyTrend: Array<{ date: string; emailsFound: number; hrEmails: number; companies: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dateStr = dayStart.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });

      const dayLeads = allLeads.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      });

      const dayJobs = allJobs.filter((j) => {
        const t = new Date(j.createdAt).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      });

      const hrCount = dayLeads.filter(
        (l) => l.emailCategory === "HR" || l.emailCategory === "Recruitment" || l.emailCategory === "Careers"
      ).length;

      const companiesCount = dayJobs.reduce((acc, j) => acc + j.companiesFound, 0);

      dailyTrend.push({
        date: dateStr,
        emailsFound: dayLeads.length,
        hrEmails: hrCount,
        companies: companiesCount,
      });
    }

    return {
      today: buildMetricSet(startOfToday),
      yesterday: buildMetricSet(startOfYesterday, startOfToday),
      last7Days: buildMetricSet(startOf7Days),
      last30Days: buildMetricSet(startOf30Days),
      dailyTrend,
    };
  }
}

export const leadDiscoveryRepo = new LeadDiscoveryRepo();
