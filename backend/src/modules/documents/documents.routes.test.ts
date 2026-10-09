import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import http from "http";
import { documentsService } from "./documents.service.js";
import { LIMITS } from "../../config/constants.js";

/** Builds a multipart/form-data body the way a browser FormData would. */
function multipart(parts: { name: string; value: string | Buffer; filename?: string }[]) {
  const boundary = "----mailnexTestBoundary";
  const chunks: Buffer[] = [];
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename) head += `; filename="${p.filename}"\r\nContent-Type: application/octet-stream`;
    chunks.push(Buffer.from(`${head}\r\n\r\n`), Buffer.from(p.value), Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

/**
 * Documents routes. The service is stubbed, so no database or disk is needed: these
 * check auth, the multipart handling and the size limit enforced while reading the upload.
 */
describe("documents routes (no DB required)", () => {
  let app: FastifyInstance;
  let auth: { authorization: string };

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: 7, email: "t@t.com" })}` };
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const [method, url] of [["GET", "/settings/documents"], ["POST", "/settings/documents"], ["DELETE", "/settings/documents/1"]]) {
    it(`${method} ${url} returns 401 without a token`, async () => {
      const res = await app.inject({ method: method as "GET", url });
      expect(res.statusCode).toBe(401);
    });
  }

  it("the old resume endpoints are gone", async () => {
    for (const url of ["/settings/resumes", "/settings/resume"]) {
      const res = await app.inject({ method: "POST", url, headers: auth });
      expect(res.statusCode).toBe(404);
    }
  });

  it("GET lists the user's documents together with the upload limits", async () => {
    const list = vi.spyOn(documentsService, "list").mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/settings/documents", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      documents: [],
      limits: { maxDocuments: 10, maxBytes: LIMITS.DOCUMENT_MAX_BYTES, extensions: [...LIMITS.DOCUMENT_EXTENSIONS] },
    });
    expect(list).toHaveBeenCalledWith(7);
  });

  it("POST hands the name, original file name and bytes to the service and returns 201", async () => {
    const created = { id: 3, name: "Prices", fileName: "prices.pdf", createdAt: new Date("2026-01-01T00:00:00Z") };
    const upload = vi.spyOn(documentsService, "upload").mockResolvedValue(created);
    const body = multipart([
      { name: "name", value: "Prices" },
      { name: "file", value: "%PDF-1.7 hello", filename: "prices.pdf" },
    ]);
    const res = await app.inject({ method: "POST", url: "/settings/documents", headers: { ...auth, ...body.headers }, payload: body.payload });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ ...created, createdAt: "2026-01-01T00:00:00.000Z" });
    expect(upload).toHaveBeenCalledWith(7, { name: "Prices", originalName: "prices.pdf", content: Buffer.from("%PDF-1.7 hello") });
  });

  it("POST rejects a file over the size limit with 413 before the service sees it", async () => {
    const upload = vi.spyOn(documentsService, "upload");
    const body = multipart([{ name: "file", value: Buffer.alloc(LIMITS.DOCUMENT_MAX_BYTES + 1, 0x41), filename: "big.txt" }]);
    const res = await app.inject({ method: "POST", url: "/settings/documents", headers: { ...auth, ...body.headers }, payload: body.payload });
    expect(res.statusCode).toBe(413);
    expect(res.json().message).toBe("This file is too large. Documents can be up to 5 MB.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("POST rejects with 413 when the size limit falls exactly between two network reads", async () => {
    // Over a real socket the server reads exactly DOCUMENT_MAX_BYTES of file data, then the
    // rest arrives. busboy cuts the stream without a partial chunk, so toBuffer() returns
    // the first 5 MB without throwing; only file.truncated tells the upload was cut.
    const upload = vi
      .spyOn(documentsService, "upload")
      .mockResolvedValue({ id: 1, name: "big", fileName: "big.txt", createdAt: new Date() });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as { port: number };
    const boundary = "----mailnexTestBoundary";
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.txt"\r\nContent-Type: text/plain\r\n\r\n`,
    );
    const first = Buffer.concat([head, Buffer.alloc(LIMITS.DOCUMENT_MAX_BYTES, 0x41)]);
    const rest = Buffer.concat([Buffer.alloc(1024, 0x41), Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/settings/documents",
          headers: {
            ...auth,
            "content-type": `multipart/form-data; boundary=${boundary}`,
            "content-length": first.length + rest.length,
          },
        },
        (r) => {
          let body = "";
          r.on("data", (d) => (body += d));
          r.on("end", () => resolve({ status: r.statusCode ?? 0, body }));
        },
      );
      req.on("error", reject);
      req.write(first);
      setTimeout(() => req.end(rest), 300);
    });
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body).message).toBe("This file is too large. Documents can be up to 5 MB.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("POST without a file returns 400", async () => {
    const body = multipart([{ name: "name", value: "No file" }]);
    const res = await app.inject({ method: "POST", url: "/settings/documents", headers: { ...auth, ...body.headers }, payload: body.payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Choose a file to upload.");
  });

  it("POST passes the service's validation errors through with their status and message", async () => {
    vi.spyOn(documentsService, "upload").mockRejectedValue(
      Object.assign(new Error("You already have 10 documents, the maximum. Delete one to upload another."), { statusCode: 409 }),
    );
    const body = multipart([{ name: "file", value: "%PDF-1.7", filename: "a.pdf" }]);
    const res = await app.inject({ method: "POST", url: "/settings/documents", headers: { ...auth, ...body.headers }, payload: body.payload });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/10 documents/);
  });

  it("DELETE validates the id and deletes for the current user", async () => {
    const remove = vi.spyOn(documentsService, "remove").mockResolvedValue();
    const bad = await app.inject({ method: "DELETE", url: "/settings/documents/abc", headers: auth });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: "DELETE", url: "/settings/documents/5", headers: auth });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ deleted: true });
    expect(remove).toHaveBeenCalledWith(7, 5);
  });
});
