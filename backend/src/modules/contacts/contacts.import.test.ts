import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import type { FastifyInstance } from "fastify";

// Uploads land in a throwaway folder; the import service itself is stubbed, so no
// database is touched.
const uploadDir = path.join(os.tmpdir(), `mailnex-import-test-${process.pid}`);
process.env.UPLOAD_DIR = uploadDir;

const { contactsService } = await import("./contacts.service.js");
const { activeImports } = await import("./contacts.controller.js");

function multipart(fileName: string, content: string) {
  const boundary = "----mailnex-test-boundary";
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    "Content-Type: text/csv\r\n\r\n" +
    `${content}\r\n` +
    `--${boundary}--\r\n`;
  return { payload: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("POST /contacts/import (no DB required)", () => {
  let app: FastifyInstance;
  const auth = (sub: number) => ({ authorization: `Bearer ${app.jwt.sign({ sub, email: "i@test.com" })}` });

  const upload = (sub: number) => {
    const { payload, headers } = multipart("list.csv", "email\na@x.io");
    return app.inject({ method: "POST", url: "/contacts/import", payload, headers: { ...headers, ...auth(sub) } });
  };

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp({ TRUST_PROXY: false, CORS_ORIGINS: [] });
    await app.ready();
  }, 30000);

  afterEach(() => {
    vi.restoreAllMocks();
    activeImports.clear();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  it("allows one import at a time per user and frees the slot when it ends", async () => {
    let finish!: () => void;
    const running = new Promise<void>((resolve) => (finish = resolve));
    const importFromFile = vi
      .spyOn(contactsService, "importFromFile")
      .mockImplementation(async () => {
        await running;
        return { total: 1, imported: 1, skipped: 0, duplicate: 0, invalid: 0 };
      });

    expect((await upload(71)).statusCode).toBe(202);
    const second = await upload(71);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatch(/already running/);
    // Another user is not blocked.
    expect((await upload(72)).statusCode).toBe(202);
    expect(importFromFile).toHaveBeenCalledTimes(2);

    finish();
    await vi.waitFor(() => expect(activeImports.has(71)).toBe(false));
    expect((await upload(71)).statusCode).toBe(202);
  });

  it("frees the slot when the import fails, without an unhandled rejection", async () => {
    vi.spyOn(contactsService, "importFromFile").mockRejectedValue(new Error("boom"));
    expect((await upload(73)).statusCode).toBe(202);
    await vi.waitFor(() => expect(activeImports.has(73)).toBe(false));
    expect((await upload(73)).statusCode).toBe(202);
  });
});
