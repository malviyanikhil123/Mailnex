import { describe, it, expect } from "vitest";
import { classifyEmail } from "./classifier.js";

describe("classifyEmail", () => {
  it("classifies HR and Recruitment emails accurately with high confidence", () => {
    const hr = classifyEmail("hr@enterprise.com");
    expect(hr.category).toBe("HR");
    expect(hr.confidence).toBeGreaterThanOrEqual(0.95);

    const careers = classifyEmail("careers@techcorp.io");
    expect(careers.category).toBe("Careers");
    expect(careers.confidence).toBeGreaterThanOrEqual(0.95);

    const recruiting = classifyEmail("recruitment@global.org");
    expect(recruiting.category).toBe("Recruitment");
    expect(recruiting.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("classifies IT, Finance, and Sales emails", () => {
    const itEmail = classifyEmail("tech@devcorp.com");
    expect(itEmail.category).toBe("IT");

    const financeEmail = classifyEmail("finance@acme.com");
    expect(financeEmail.category).toBe("Finance");

    const salesEmail = classifyEmail("sales@startup.co");
    expect(salesEmail.category).toBe("Sales");
  });

  it("uses URL context to identify Careers when email prefix is ambiguous", () => {
    const contextEmail = classifyEmail("contact@acme.com", { url: "https://acme.com/careers/openings" });
    expect(contextEmail.category).toBe("Careers");
    expect(contextEmail.confidence).toBeGreaterThanOrEqual(0.8);
  });
});
