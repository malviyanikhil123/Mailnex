export const LIMITS = {
  DAILY: 50, START_HOUR: 9, END_HOUR: 18, MAX_RETRIES: 3,
  RETRY_DELAYS_MS: [3_600_000, 21_600_000, 86_400_000] as const,
} as const;
