/**
 * Crypto util tests.
 *
 * ESM note: static `import` statements are hoisted before any top-level code
 * runs, so env vars must be set via a Vitest setup file (see vitest.config.ts)
 * or via the `setupFiles` option.  We use a dedicated setup file so that
 * `process.env` is populated BEFORE the lazy env proxy resolves.
 */
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto.js";

describe("crypto", () => {
  it("round-trips", () => {
    const c = encrypt("super-secret");
    expect(c).not.toContain("super-secret");
    expect(decrypt(c)).toBe("super-secret");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const c1 = encrypt("same-input");
    const c2 = encrypt("same-input");
    expect(c1).not.toBe(c2);
  });

  it("output has three colon-separated parts (iv:tag:ciphertext)", () => {
    const c = encrypt("test");
    const parts = c.split(":");
    expect(parts).toHaveLength(3);
  });
});
