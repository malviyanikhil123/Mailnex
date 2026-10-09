import { describe, it, expect } from "vitest";
import { fileExtension, matchesFileSignature, sanitizeFileName } from "./file-upload.js";

const bytes = (...b: number[]) => Buffer.from(b);
const OLE2 = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0);
const zipWith = (entry: string) => Buffer.concat([bytes(0x50, 0x4b, 0x03, 0x04), Buffer.from(`....${entry}document.xml`)]);

describe("sanitizeFileName", () => {
  it("keeps an ordinary name as it is", () => {
    expect(sanitizeFileName("Price list 2026.pdf")).toBe("Price list 2026.pdf");
  });

  it("drops directory parts so a name can never point elsewhere", () => {
    expect(sanitizeFileName("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(sanitizeFileName("C:\\Users\\me\\brochure.pdf")).toBe("brochure.pdf");
  });

  it("removes control, header-unsafe and bidi-override characters", () => {
    expect(sanitizeFileName('a<b>:"c"|d?*.pdf')).toBe("abcd.pdf");
    expect(sanitizeFileName("bad\r\nname\u0000.pdf")).toBe("badname.pdf");
    expect(sanitizeFileName("invoice\u202Efdp.exe")).toBe("invoicefdp.exe");
  });

  it("strips leading/trailing dots and spaces and names a bare extension", () => {
    expect(sanitizeFileName("  ..hidden.pdf. ")).toBe("hidden.pdf");
    expect(sanitizeFileName(".pdf")).toBe("document.pdf");
    expect(sanitizeFileName("..")).toBe("");
  });

  it("shortens very long names but keeps the extension", () => {
    const name = sanitizeFileName(`${"x".repeat(300)}.docx`);
    expect(name.endsWith(".docx")).toBe(true);
    expect(name.length).toBe(120 + ".docx".length);
  });
});

describe("fileExtension", () => {
  it("returns the lower-case extension, or empty when there is none", () => {
    expect(fileExtension("Report.PDF")).toBe("pdf");
    expect(fileExtension("archive.tar.gz")).toBe("gz");
    expect(fileExtension("README")).toBe("");
  });
});

describe("matchesFileSignature", () => {
  it("recognises each allowed type by its content", () => {
    expect(matchesFileSignature("pdf", Buffer.from("%PDF-1.7\n..."))).toBe(true);
    expect(matchesFileSignature("doc", OLE2)).toBe(true);
    expect(matchesFileSignature("doc", Buffer.from("{\\rtf1\\ansi hello}"))).toBe(true);
    expect(matchesFileSignature("xls", OLE2)).toBe(true);
    expect(matchesFileSignature("ppt", OLE2)).toBe(true);
    expect(matchesFileSignature("docx", zipWith("word/"))).toBe(true);
    expect(matchesFileSignature("xlsx", zipWith("xl/"))).toBe(true);
    expect(matchesFileSignature("pptx", zipWith("ppt/"))).toBe(true);
    expect(matchesFileSignature("png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(true);
    expect(matchesFileSignature("jpg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesFileSignature("jpeg", bytes(0xff, 0xd8, 0xff, 0xe1))).toBe(true);
    expect(matchesFileSignature("csv", Buffer.from("name,email\nA,a@x.com\n"))).toBe(true);
    expect(matchesFileSignature("txt", Buffer.from("héllo wörld"))).toBe(true);
    expect(matchesFileSignature("txt", bytes(0xff, 0xfe, 0x68, 0x00))).toBe(true);
  });

  it("rejects content that does not match the extension", () => {
    const exe = Buffer.concat([Buffer.from("MZ"), bytes(0x90, 0, 3, 0)]);
    expect(matchesFileSignature("pdf", exe)).toBe(false);
    expect(matchesFileSignature("png", Buffer.from("%PDF-1.4"))).toBe(false);
    expect(matchesFileSignature("docx", zipWith("xl/"))).toBe(false);
    expect(matchesFileSignature("docx", Buffer.from("plain text"))).toBe(false);
    expect(matchesFileSignature("txt", exe)).toBe(false);
    expect(matchesFileSignature("jpg", bytes(0xff, 0xd8))).toBe(false);
  });

  it("rejects extensions outside the allowed list", () => {
    expect(matchesFileSignature("exe", Buffer.from("MZ"))).toBe(false);
    expect(matchesFileSignature("", Buffer.from("x"))).toBe(false);
  });
});
