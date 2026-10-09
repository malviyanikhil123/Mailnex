import { z } from "zod";

/** bcrypt only looks at the first 72 bytes, so a longer password would be silently truncated. */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_MIN_LENGTH = 8;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email");

export const loginSchema = z.object({
  email,
  // No minimum or 72-byte cap here: accounts created before those rules existed must still sign in.
  password: z.string().min(1, "Password is required").max(1024, "Password is too long"),
  /** Ticked: 30-day session kept across browser restarts. Unticked: short session for this browser only. */
  rememberMe: z.boolean().default(false),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .refine(
      (p) => Buffer.byteLength(p, "utf8") <= PASSWORD_MAX_BYTES,
      `Password must be at most ${PASSWORD_MAX_BYTES} characters`,
    ),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(4096),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
