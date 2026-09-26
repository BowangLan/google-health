/** Each destination owns its URL state. There is no app-wide selected date. */
export type Route =
  | { page: "journal"; day: string | null }
  | { page: "trends"; days: number; day: string | null };

export function validDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function readRoute(hash: string): Route {
  const [path, query] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  if (path === "/trends") {
    const requested = Number(params.get("days") ?? 90);
    return {
      page: "trends",
      days: [30, 90, 180, 365].includes(requested) ? requested : 90,
      day: validDay(params.get("day")),
    };
  }
  return { page: "journal", day: validDay(params.get("date")) };
}

export function journalHref(day?: string): string {
  return day ? "#/journal?date=" + day : "#/journal";
}

export function trendsHref(days = 90, day?: string): string {
  return "#/trends?days=" + days + (day ? "&day=" + day : "");
}
