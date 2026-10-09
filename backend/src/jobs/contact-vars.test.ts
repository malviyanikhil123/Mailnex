import { describe, it, expect } from "vitest";
import { buildContactVars } from "./contact-vars.js";
import type { ContactRow } from "./send-email.js";

function contact(over: Partial<ContactRow> = {}): ContactRow {
  return {
    id: 1,
    companyName: "Acme",
    location: "Berlin",
    email: "ada@acme.io",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+49 30 1234",
    website: "acme.io",
    customFields: {},
    status: "PENDING",
    retryCount: 0,
    ...over,
  };
}

describe("buildContactVars", () => {
  it("returns the agreed built-in contact variables", () => {
    expect(buildContactVars(contact())).toEqual({
      company: "Acme",
      location: "Berlin",
      first_name: "Ada",
      last_name: "Lovelace",
      full_name: "Ada Lovelace",
      contact_email: "ada@acme.io",
      contact_phone: "+49 30 1234",
      contact_website: "acme.io",
    });
  });

  it("fills unknown fields with empty strings so no placeholder is left behind", () => {
    const vars = buildContactVars({
      id: 2,
      companyName: null,
      location: null,
      email: "x@y.io",
      status: "PENDING",
      retryCount: 0,
    });
    expect(vars).toEqual({
      company: "",
      location: "",
      first_name: "",
      last_name: "",
      full_name: "",
      contact_email: "x@y.io",
      contact_phone: "",
      contact_website: "",
    });
  });

  it("builds full_name from whichever name parts exist", () => {
    expect(buildContactVars(contact({ lastName: null })).full_name).toBe("Ada");
    expect(buildContactVars(contact({ firstName: " ", lastName: "Lovelace" })).full_name).toBe("Lovelace");
  });

  it("adds every custom field, but built-in variables win over a custom field of the same name", () => {
    const vars = buildContactVars(
      contact({ customFields: { industry: "Fintech", company: "WRONG", first_name: "WRONG", deal_size: 5 } }),
    );
    expect(vars.industry).toBe("Fintech");
    expect(vars.deal_size).toBe("5");
    expect(vars.company).toBe("Acme");
    expect(vars.first_name).toBe("Ada");
  });

  it("ignores non-text custom values", () => {
    const vars = buildContactVars(contact({ customFields: { nested: { a: 1 }, empty: null, blank: "" } }));
    expect(vars).not.toHaveProperty("nested");
    expect(vars).not.toHaveProperty("empty");
    expect(vars.blank).toBe("");
  });
});
