import { companyFinder } from "./company-finder.js";
import { politeCrawler } from "./crawler.js";
import { classifyEmail } from "./classifier.js";
import { leadDiscoveryRepo, LeadInsertItem } from "./lead-discovery.repo.js";
import { logger } from "../../utils/logger.js";

export class LeadDiscoveryWorker {
  async processJob(userId: number, jobId: number): Promise<void> {
    const job = await leadDiscoveryRepo.getJobById(userId, jobId);
    if (!job) {
      logger.error({ jobId, userId }, "Discovery Worker: job not found");
      return;
    }

    try {
      await leadDiscoveryRepo.updateJob(jobId, {
        status: "RUNNING",
        startedAt: new Date(),
        progress: 5,
      });

      // 1. Discover target companies
      const companies = await companyFinder.findCompanies({
        location: job.location ?? undefined,
        profession: job.profession ?? undefined,
        keywords: job.keywords ?? undefined,
        companyType: job.companyType ?? undefined,
        targetCount: job.targetCount,
      });

      logger.info({ jobId, companyCount: companies.length }, "Discovery Worker: found companies to crawl");

      let totalPagesCrawled = 0;
      let totalEmailsFound = 0;
      let totalHrEmailsFound = 0;
      let totalDuplicatesRemoved = 0;
      let companiesProcessed = 0;

      const targetCount = job.targetCount || 50;

      for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        companiesProcessed++;

        // Calculate progress %
        const progressPct = Math.min(95, Math.floor(10 + (companiesProcessed / companies.length) * 85));

        await leadDiscoveryRepo.updateJob(jobId, {
          currentDomain: company.domain,
          companiesFound: companiesProcessed,
          progress: progressPct,
        });

        // 2. Crawl priority pages
        const pages = await politeCrawler.crawlDomain(company.domain, {
          maxPages: 5,
          timeoutMs: 4000,
          throttleMs: 200,
        });

        totalPagesCrawled += pages.length;

        // 3. Extract, normalize, and collect emails
        const rawEmailItems: Array<{
          email: string;
          normalizedEmail: string;
          sourceUrl?: string;
          contextSnippet?: string;
          pageTitle?: string;
        }> = [];

        for (const page of pages) {
          for (const emailObj of page.emails) {
            rawEmailItems.push({
              email: emailObj.email,
              normalizedEmail: emailObj.normalizedEmail,
              sourceUrl: emailObj.sourceUrl,
              contextSnippet: emailObj.contextSnippet,
              pageTitle: page.title,
            });
          }
        }

        if (rawEmailItems.length > 0) {
          // Deduplicate within this company crawl
          const uniqueCandidateMap = new Map<string, typeof rawEmailItems[0]>();
          for (const item of rawEmailItems) {
            if (!uniqueCandidateMap.has(item.normalizedEmail)) {
              uniqueCandidateMap.set(item.normalizedEmail, item);
            }
          }

          const uniqueList = Array.from(uniqueCandidateMap.values());
          const normalizedEmails = uniqueList.map((x) => x.normalizedEmail);

          // Check against DB for existing duplicates
          const existingSet = await leadDiscoveryRepo.getExistingEmails(userId, normalizedEmails);

          const leadsToInsert: LeadInsertItem[] = [];

          for (const item of uniqueList) {
            const isDup = existingSet.has(item.normalizedEmail);
            if (isDup) {
              totalDuplicatesRemoved++;
            }

            const classification = classifyEmail(item.email, {
              url: item.sourceUrl,
              pageTitle: item.pageTitle,
              contextSnippet: item.contextSnippet,
            });

            const isHr =
              classification.category === "HR" ||
              classification.category === "Recruitment" ||
              classification.category === "Careers";

            if (isHr) {
              totalHrEmailsFound++;
            }
            totalEmailsFound++;

            leadsToInsert.push({
              jobId,
              email: item.email,
              normalizedEmail: item.normalizedEmail,
              name: undefined,
              companyName: company.name,
              companyDomain: company.domain,
              companyType: company.companyType,
              industry: company.industry,
              location: company.location,
              emailCategory: classification.category,
              classificationConfidence: classification.confidence,
              sourceUrl: item.sourceUrl,
              isDuplicate: isDup,
            });
          }

          // Insert leads into DB
          await leadDiscoveryRepo.insertLeads(userId, leadsToInsert);
        }

        // Update running job counters
        await leadDiscoveryRepo.updateJob(jobId, {
          pagesCrawled: totalPagesCrawled,
          emailsFound: totalEmailsFound,
          hrEmailsFound: totalHrEmailsFound,
          duplicatesRemoved: totalDuplicatesRemoved,
          companiesFound: companiesProcessed,
        });

        // Break early if we reached targetCount
        if (totalEmailsFound >= targetCount) {
          break;
        }
      }

      // Mark Job Completed
      await leadDiscoveryRepo.updateJob(jobId, {
        status: "COMPLETED",
        progress: 100,
        currentDomain: null,
        completedAt: new Date(),
        pagesCrawled: totalPagesCrawled,
        emailsFound: totalEmailsFound,
        hrEmailsFound: totalHrEmailsFound,
        duplicatesRemoved: totalDuplicatesRemoved,
        companiesFound: companiesProcessed,
      });

      logger.info(
        { jobId, totalEmailsFound, totalHrEmailsFound, totalPagesCrawled },
        "Discovery Worker: job completed successfully"
      );
    } catch (err: any) {
      logger.error({ jobId, error: err.message }, "Discovery Worker: job failed");
      await leadDiscoveryRepo.updateJob(jobId, {
        status: "FAILED",
        error: err.message || "Unknown discovery error",
        completedAt: new Date(),
      });
    }
  }
}

export const leadDiscoveryWorker = new LeadDiscoveryWorker();
