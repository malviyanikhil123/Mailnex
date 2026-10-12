import { describe, it, expect } from "vitest";
import { likeContains } from "./like.js";

const BS = "\\"; // one backslash

describe("likeContains", () => {
  it("wraps a plain term in wildcards", () => {
    expect(likeContains("acme")).toBe("%acme%");
  });
  it("escapes %, _ and backslash so they match literally", () => {
    expect(likeContains(`50%_off${BS}`)).toBe(`%50${BS}%${BS}_off${BS}${BS}%`);
    expect(likeContains("%")).toBe(`%${BS}%%`);
  });
});
