// Mirrors the JSON that healthsync/web.py returns. Kept in one file so a
// server-side change surfaces as a type error rather than a runtime surprise.

export type RecordState = "synced" | "new" | "edited" | "awaiting pull";
export type Kind = "food" | "weight";

export interface FoodRow {
  state: RecordState;
  id: string | null;
  path: string;
  time: string;
  day: string;
  meal: string;
  name: string;
  kcal: number;
  carbs: number | null;
  fat: number | null;
  protein: number | null;
  sugar: number | null;
  fiber: number | null;
  sodium_mg: number | null;
  amount: number;
  unit: string;
  identified: boolean;
  note: string;
}

export interface WeightRow {
  state: RecordState;
  id: string | null;
  path: string;
  time: string;
  day: string;
  kg: number;
  value: number;
  unit: "kg" | "lb";
  remote_note: string;
  note: string;
}

export interface Totals {
  kcal: number;
  carbs: number;
  fat: number;
  protein: number;
  sugar: number;
  fiber: number;
}

export interface DayView {
  day: string;
  today: string;
  timezone: string;
  weight_unit: "kg" | "lb";
  food: FoodRow[];
  totals: Totals;
  weights: WeightRow[];
  /** Google's total calories burned for the day; null until pulled. */
  burned: { kcal: number; fetched: string } | null;
  broken: string[];
}

export interface MonthCell {
  day: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: number;
  weight: { time: string; value: number; delta: number | null } | null;
  weight_count: number;
  states: Record<string, number>;
  worst: RecordState | null;
}

export interface MonthView {
  month: string;
  label: string;
  today: string;
  first: string;
  last: string;
  grid_start: string;
  grid_end: string;
  weight_unit: "kg" | "lb";
  timezone: string;
  days: Record<string, MonthCell>;
  broken: string[];
}

export interface FoodMatch extends FoodRow {
  /** Position in `food clone`'s own listing for this keyword. */
  index: number;
}

export interface FoodSearch {
  keyword: string;
  matches: FoodMatch[];
  total: number;
}

export interface WeightSeries {
  unit: "kg" | "lb";
  days: number;
  since: string;
  points: WeightRow[];
  broken: string[];
}

export interface Collection {
  kind: Kind;
  error?: string;
  directory: string;
  index: string;
  timezone: string;
  weight_unit: "kg" | "lb";
  source: string | null;
  ghealth: string;
  synced: number;
  edited: number;
  new: number;
  deleted: number;
  awaiting: number;
  pending: number;
  details: Record<
    "edited" | "new" | "deleted" | "awaiting" | "pending" | "broken",
    string[]
  >;
}

export interface Overview {
  collections: Collection[];
}

export interface Targets {
  daily_kcal: number | null;
  daily_protein_g: number | null;
  /** Display override. null follows the unit the CLI is configured to print. */
  weight_unit: "kg" | "lb" | null;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  command: string;
  error?: string;
}

export interface LogEntry {
  id: number;
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
  at: Date;
}

export interface WeightReading {
  time: string;
  value: number;
}

export interface SeriesRow {
  day: string;
  entries: number;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium_mg: number | null;
  unaccounted_kcal: number | null;
  first_entry: string | null;
  last_entry: string | null;
  weight: number | null;
  weight_readings: WeightReading[];
}

export interface SeriesGap {
  from: string;
  to: string;
  days: number;
}

export interface Series {
  since: string;
  until: string;
  today: string;
  days: number;
  unit: "kg" | "lb";
  timezone: string;
  targets: Targets;
  rows: SeriesRow[];
  gaps: SeriesGap[];
  coverage: {
    days_in_range: number;
    days_logged: number;
    days_weighed: number;
  };
  broken: string[];
}

export type RunCommand = (
  collection: Kind | "all",
  command: string,
  values: Record<string, string | boolean>,
) => Promise<{ ok: boolean; text: string }>;

/** Which of `hsync sync`'s actions to run after its comparison. */
export interface SyncOptions {
  pull?: boolean;
  push?: boolean;
  /** Confirms remote deletions, which the CLI otherwise holds without a terminal. */
  yes?: boolean;
}

export interface SyncDiff {
  field: string;
  local: string;
  remote: string;
}

/** One printed record line from the CLI, split into the parts a page lays out. */
export interface SyncRow {
  tag: string;
  text: string;
  phase: "compare" | "pull" | "push";
  detail: string;
  time?: string;
  path?: string;
  diff: SyncDiff[];
}

export interface SyncCollection {
  kind: Kind | null;
  /** False when the run ended before this collection was compared. */
  checked: boolean;
  since: string | null;
  until: string | null;
  incoming: SyncRow[];
  outgoing: SyncRow[];
  attention: SyncRow[];
  comparison: {
    matched: number;
    different: number;
    missing: number;
    remote_only: number;
  } | null;
  ran: ("pull" | "push")[];
  pull: { fetched: number; saved: number; removed: number; held: number } | null;
  push: {
    saved: number;
    deleted: number;
    absent: number;
    recovered: number;
    failed: number;
  } | null;
  dry_run: boolean;
  events: SyncRow[];
  deletions: SyncRow[];
  deletions_held: boolean;
  notes: string[];
  error: string | null;
}

export interface SyncResult extends RunResult {
  collections: SyncCollection[];
  /** The calories-burned refresh that follows a pull. */
  burned?: { code: number | null; stderr: string };
  /** The local state right after the run, so no second request is needed. */
  overview: Overview;
}
