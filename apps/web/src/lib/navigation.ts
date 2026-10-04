/**
 * The dashboard has one selected day and one trend range, both in the URL.
 * Older `#/journal?date=` and `#/trends?days=&day=` links still resolve.
 */
export interface Route {
  /** null follows today. */
  day: string | null;
  days: number;
}

export const RANGES = [30, 90, 180, 365] as const;
export const DEFAULT_DAYS = 90;

export function validDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function readRoute(hash: string): Route {
  const [, query] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const requested = Number(params.get("days") ?? DEFAULT_DAYS);
  return {
    day: validDay(params.get("date") ?? params.get("day")),
    days: (RANGES as readonly number[]).includes(requested)
      ? requested
      : DEFAULT_DAYS,
  };
}

export function dashboardHref(day?: string | null, days = DEFAULT_DAYS): string {
  const params = new URLSearchParams();
  if (day) params.set("date", day);
  if (days !== DEFAULT_DAYS) params.set("days", String(days));
  const query = params.toString();
  return "#/" + (query ? "?" + query : "");
}
