import { URL } from "url";

/**
 * Validates if a URL is safe to crawl.
 * Prevents SSRF attacks by disallowing:
 * - Non-http/https protocols (file://, gopher://, ftp://, etc.)
 * - Localhost / Loopback addresses (127.0.0.1, ::1, 0.0.0.0, localhost)
 * - Private IPv4 subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
 * - Private IPv6 ranges (fc00::/7, fe80::/10)
 */
export function isUrlSafe(inputUrl: string): boolean {
  try {
    const parsed = new URL(inputUrl);

    // Protocol check
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check localhost string
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }

    // IP address checks
    // Check IPv4
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const [_, o1, o2, o3, o4] = match.map(Number);
      if (o1 === 0 || o1 === 127) return false; // 0.0.0.0/8 or 127.0.0.0/8
      if (o1 === 10) return false; // 10.0.0.0/8
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return false; // 172.16.0.0/12
      if (o1 === 192 && o2 === 168) return false; // 192.168.0.0/16
      if (o1 === 169 && o2 === 254) return false; // 169.254.0.0/16 Link local
    }

    // Check IPv6 loopbacks / link-local / unique-local
    if (
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
