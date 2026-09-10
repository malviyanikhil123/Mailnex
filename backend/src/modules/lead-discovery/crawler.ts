import { isUrlSafe } from "./validator.js";
import { extractEmailsFromHtml, extractPageTitle, ExtractedEmail } from "./extractor.js";
import { logger } from "../../utils/logger.js";

export interface CrawledPageResult {
  url: string;
  title: string;
  emails: ExtractedEmail[];
  links: string[];
}

export interface CrawlDomainOptions {
  maxPages?: number;
  timeoutMs?: number;
  throttleMs?: number;
  onPageCrawled?: (pageUrl: string, emailsFoundCount: number) => void;
}

const PRIORITY_PATHS = [
  "/",
  "/careers",
  "/career",
  "/jobs",
  "/recruitment",
  "/recruiting",
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/team",
  "/people",
];

export class PoliteCrawler {
  private userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

  /**
   * Crawls priority pages for a given company domain.
   */
  async crawlDomain(domainOrUrl: string, options: CrawlDomainOptions = {}): Promise<CrawledPageResult[]> {
    const maxPages = options.maxPages ?? 6;
    const timeoutMs = options.timeoutMs ?? 5000;
    const throttleMs = options.throttleMs ?? 250;

    let rootUrl = domainOrUrl.trim();
    if (!rootUrl.startsWith("http://") && !rootUrl.startsWith("https://")) {
      rootUrl = `https://${rootUrl}`;
    }

    if (!isUrlSafe(rootUrl)) {
      logger.warn({ rootUrl }, "Crawler: unsafe URL rejected");
      return [];
    }

    let parsedRoot: URL;
    try {
      parsedRoot = new URL(rootUrl);
    } catch {
      return [];
    }

    const baseOrigin = parsedRoot.origin;
    const visited = new Set<string>();
    const queue: string[] = [];
    const results: CrawledPageResult[] = [];

    // Seed priority paths
    for (const p of PRIORITY_PATHS) {
      queue.push(`${baseOrigin}${p}`);
    }

    while (queue.length > 0 && results.length < maxPages) {
      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      if (!isUrlSafe(currentUrl)) continue;

      try {
        const pageResult = await this.fetchPage(currentUrl, timeoutMs);
        if (pageResult) {
          results.push(pageResult);
          options.onPageCrawled?.(currentUrl, pageResult.emails.length);

          // Add newly discovered priority links
          for (const link of pageResult.links) {
            if (!visited.has(link) && queue.length < 20) {
              queue.push(link);
            }
          }
        }
      } catch (err: any) {
        logger.debug({ url: currentUrl, error: err.message }, "Crawler page fetch failed");
      }

      if (throttleMs > 0 && queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, throttleMs));
      }
    }

    return results;
  }

  private async fetchPage(pageUrl: string, timeoutMs: number): Promise<CrawledPageResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(pageUrl, {
        method: "GET",
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (!response.ok) return null;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        return null;
      }

      const html = await response.text();
      // Cap at 1MB
      if (html.length > 1024 * 1024) {
        return null;
      }

      const title = extractPageTitle(html);
      const emails = extractEmailsFromHtml(html, pageUrl);
      const links = this.extractRelevantLinks(html, pageUrl);

      return {
        url: pageUrl,
        title,
        emails,
        links,
      };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private extractRelevantLinks(html: string, currentUrl: string): string[] {
    const links: string[] = [];
    try {
      const parsedCurrent = new URL(currentUrl);
      const linkRegex = /<a[^>]+href=["']([^"'#\s]+)["']/gi;
      let match: RegExpExecArray | null;

      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1].trim();
        if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
          continue;
        }

        let absoluteUrl: URL;
        try {
          absoluteUrl = new URL(href, currentUrl);
        } catch {
          continue;
        }

        // Only crawl same origin
        if (absoluteUrl.origin !== parsedCurrent.origin) continue;

        const pathLower = absoluteUrl.pathname.toLowerCase();
        const isPriorityPath = PRIORITY_PATHS.some((p) => pathLower.includes(p.replace("/", "")));
        if (isPriorityPath && isUrlSafe(absoluteUrl.toString())) {
          links.push(absoluteUrl.toString());
        }
      }
    } catch {}

    return Array.from(new Set(links));
  }
}

export const politeCrawler = new PoliteCrawler();
