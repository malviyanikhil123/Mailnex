import { describe, it, expect } from "vitest";
import { csvCell, contactsToCsv } from "./csv";
import type { Contact } from "../../types/api";

describe("csvCell", () => {
  it("neutralizes values a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1 555 0100")).toBe("'+1 555 0100");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@handle")).toBe("'@handle");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Acme, Inc")).toBe('"Acme, Inc"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
    expect(csvCell("plain")).toBe("plain");
  });
});

describe("contactsToCsv", () => {
  it("writes importer-friendly headers and one column per custom field", () => {
    const base = {
      contactPerson: null, importId: 1, retryCount: 0, nextRetryAt: null, lastContactedAt: null,
      sentAt: null, createdAt: "", updatedAt: "",
    };
    const rows: Contact[] = [
      {
        ...base, id: 1, email: "a@x.io", firstName: "Ada", lastName: "Lovelace", companyName: "Acme, Inc",
        phone: null, website: null, location: "London", customFields: { industry: "Tech" }, status: "SENT",
      },
      {
        ...base, id: 2, email: "b@x.io", firstName: null, lastName: null, companyName: null,
        phone: "+1 555", website: "b.io", location: null, customFields: { plan: "Pro" }, status: "PENDING",
      },
    ];
    expect(contactsToCsv(rows).split("\r\n")).toEqual([
      "first_name,last_name,email,company,phone,website,location,status,industry,plan",
      'Ada,Lovelace,a@x.io,"Acme, Inc",,,London,SENT,Tech,',
      ",,b@x.io,,'+1 555,b.io,,PENDING,,Pro",
    ]);
  });
});
