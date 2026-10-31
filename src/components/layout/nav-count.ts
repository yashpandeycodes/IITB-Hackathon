/** Optional per-route counters for nav badges, keyed by nav `href` (e.g. `{ "/approvals": 3 }`). */
export type NavCounts = Partial<Record<string, number>>;

export function formatNavCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}
