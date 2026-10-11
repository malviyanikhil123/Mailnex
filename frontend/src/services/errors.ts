/** The server's error message from a failed API call, or `fallback` when it sent none. */
export function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}
