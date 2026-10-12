import { describe, it, expect } from "vitest";
import { splitFullName } from "./person-name.js";

describe("splitFullName", () => {
  it.each([
    ["Ada Lovelace", "Ada", "Lovelace"],
    ["  Ada   King  Lovelace ", "Ada", "King Lovelace"],
    ["Lovelace, Ada", "Ada", "Lovelace"],
    ["Ada Lovelace, PhD", "Ada", "Lovelace"],
    ["Dr. Ada Lovelace", "Ada", "Lovelace"],
    ["Cher", "Cher", ""],
    ["", "", ""],
  ])("splits %j", (full, firstName, lastName) => {
    expect(splitFullName(full)).toEqual({ firstName, lastName });
  });
});
