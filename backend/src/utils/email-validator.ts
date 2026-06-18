const RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (s: string): boolean =>
  typeof s === "string" && RE.test(s.trim());
