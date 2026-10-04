import type {
  DayView, FoodSearch, MonthView, Overview, RunResult, Series, SyncOptions, SyncResult,
  Targets, WeightSeries, Kind,
} from "@/lib/types";

export class ApiError extends Error {
  /** The server refused on policy grounds (409) rather than failing. */
  refused: boolean;
  constructor(message: string, refused = false) {
    super(message);
    this.refused = refused;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body.error || response.statusText, Boolean(body.refused));
  }
  return body as T;
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export const getMonth = (month?: string) =>
  request<MonthView>(`/api/month${month ? `?month=${month}` : ""}`);

export const getDay = (date: string) => request<DayView>(`/api/day?date=${date}`);

export const getOverview = () => request<Overview>("/api/overview");

export const getTargets = () => request<Targets>("/api/targets");

export const putTargets = (targets: Record<string, string | null>) =>
  request<Targets>("/api/targets", json("POST", targets));

export const searchFoods = (keyword: string) =>
  request<FoodSearch>(`/api/foods?q=${encodeURIComponent(keyword)}`);

export const getWeightSeries = (days: number, unit: string) =>
  request<WeightSeries>(`/api/weight?days=${days}&unit=${unit}`);

/** One call, one filesystem scan: everything the Trends surface plots. */
export const getSeries = (days: number, unit?: string) =>
  request<Series>(`/api/series?days=${days}${unit ? `&unit=${unit}` : ""}`);

/**
 * Runs the real `sync` command for both collections: compare with Google
 * Health, then pull and/or push as asked. The server serialises these.
 */
export const runSync = (options: SyncOptions) =>
  request<SyncResult>("/api/sync", json("POST", { collection: "all", ...options }));

/** Runs a real CLI command. Every remote mutation goes through here. */
export const runCommand = (
  collection: Kind | "all",
  command: string,
  values: Record<string, string | boolean>,
) => request<RunResult>("/api/run", json("POST", { collection, command, values }));

/**
 * Edit or delete a record. These do not go through the CLI, which has no
 * command for either; the server takes the collection lock and refuses
 * anything the sync engine could not reconcile.
 */
export const patchRecord = (kind: Kind, path: string, values: Record<string, string>) =>
  request<{ path: string; changed: boolean; state?: string }>(
    "/api/record", json("PATCH", { kind, path, values }),
  );

export const deleteRecord = (kind: Kind, path: string) =>
  request<{ deleted: string; staged_remote_delete: boolean }>(
    "/api/record", json("DELETE", { kind, path }),
  );
