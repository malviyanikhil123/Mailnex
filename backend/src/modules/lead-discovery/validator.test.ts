import { describe, it, expect } from "vitest";
import { isUrlSafe } from "./validator.js";

describe("isUrlSafe", () => {
  it("allows legitimate public http/https URLs", () => {
    expect(isUrlSafe("https://example.com")).toBe(true);
    expect(isUrlSafe("https://careers.google.com/jobs")).toBe(true);
    expect(isUrlSafe("http://company.org/about-us")).toBe(true);
  });

  it("blocks dangerous protocols", () => {
    expect(isUrlSafe("file:///etc/passwd")).toBe(false);
    expect(isUrlSafe("ftp://server.local")).toBe(false);
    expect(isUrlSafe("gopher://127.0.0.1")).toBe(false);
    expect(isUrlSafe("javascript:alert(1)")).toBe(false);
  });

  it("blocks localhost and loopback addresses", () => {
    expect(isUrlSafe("http://localhost:3000")).toBe(false);
    expect(isUrlSafe("http://127.0.0.1:8080")).toBe(false);
    expect(isUrlSafe("http://127.0.0.2")).toBe(false);
    expect(isUrlSafe("http://0.0.0.0")).toBe(false);
  });

  it("blocks private network subnets (SSRF protection)", () => {
    expect(isUrlSafe("http://10.0.0.1")).toBe(false);
    expect(isUrlSafe("http://10.254.12.3")).toBe(false);
    expect(isUrlSafe("http://172.16.0.1")).toBe(false);
    expect(isUrlSafe("http://172.31.255.255")).toBe(false);
    expect(isUrlSafe("http://192.168.1.1")).toBe(false);
    expect(isUrlSafe("http://169.254.169.254")).toBe(false);
  });
});
