import type { SeriesRow } from "./types";
import { parseDay } from "./format";

/**
 * Every honesty rule about smoothing, gaps and denominators lives here, so
 * the charts cannot each invent their own. Pure functions, no React.
 */

export interface TrendPoint {
  day: string;
  value: number;
  /** The window runs past the last day of the range, so this point will move. */
  provisional: boolean;
}

const WINDOW = 7;        // days in the centred mean
const MIN_PRESENT = 3;   // of those 7, how many must have a reading
const RUN_BREAK = 7;     // days apart before the line must break

/**
 * Centred 7-day mean, not trailing: a trailing mean puts the turn 3.5 days
 * after it happened, and this is a history being read back, not a live signal.
 * The cost is that the last few points shift as new readings arrive, so they
 * are marked provisional and drawn faded rather than quietly shown as final.
 */
export function centredMean(rows: SeriesRow[]): TrendPoint[] {
  const values = new Map<string, number>();
  for (const row of rows) if (row.weight !== null) values.set(row.day, row.weight);

  const out: TrendPoint[] = [];
  const half = Math.floor(WINDOW / 2);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.weight === null) continue;
    let sum = 0, seen = 0;
    for (let k = -half; k <= half; k++) {
      const other = rows[i + k];
      if (!other) continue;
      const value = values.get(other.day);
      if (value === undefined) continue;
      sum += value;
      seen += 1;
    }
    if (seen < MIN_PRESENT) continue;
    // Only days that do not exist yet can change this mean. A missing reading
    // inside the range is final, so it does not make a point provisional.
    out.push({ day: row.day, value: sum / seen, provisional: i + half >= rows.length });
  }
  return out;
}

/**
 * Split points into runs, breaking wherever consecutive readings are more than
 * a week apart. Each run is drawn as its own path: never a line across the
 * void, and never a dashed bridge, which would read as an estimate.
 */
export function runs<T extends { day: string }>(points: T[], maxGap = RUN_BREAK): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous) {
      const apart = Math.round(
        (parseDay(point.day).getTime() - parseDay(previous.day).getTime()) / 86400000,
      );
      if (apart > maxGap) { out.push(current); current = []; }
    }
    current.push(point);
  }
  if (current.length) out.push(current);
  return out;
}

/** Least-squares slope over the visible range, in units per week. */
export function ratePerWeek(points: TrendPoint[]): number | null {
  if (points.length < 2) return null;
  const origin = parseDay(points[0]!.day).getTime();
  const xs = points.map((p) => (parseDay(p.day).getTime() - origin) / 86400000);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let top = 0, bottom = 0;
  for (let i = 0; i < n; i++) {
    top += (xs[i]! - meanX) * (ys[i]! - meanY);
    bottom += (xs[i]! - meanX) ** 2;
  }
  if (bottom === 0) return null;
  return (top / bottom) * 7;
}

/** Mean over the days that actually have data, with its denominator. */
export function meanOfLogged(
  rows: SeriesRow[], key: "kcal" | "protein" | "carbs" | "fat",
): { value: number | null; days: number; of: number } {
  const present = rows.filter((row) => row[key] !== null);
  if (present.length === 0) return { value: null, days: 0, of: rows.length };
  const total = present.reduce((sum, row) => sum + (row[key] as number), 0);
  return { value: total / present.length, days: present.length, of: rows.length };
}

/** Energy from each macro, which is what makes the three commensurable. */
export function macroEnergy(row: SeriesRow) {
  return {
    protein: (row.protein ?? 0) * 4,
    carbs: (row.carbs ?? 0) * 4,
    fat: (row.fat ?? 0) * 9,
    unaccounted: row.unaccounted_kcal ?? 0,
  };
}
