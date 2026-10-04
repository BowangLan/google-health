import { parseDay, shiftDay } from "@/lib/format";

/**
 * One day scale, shared by every chart in a stack.
 *
 * Passing the same instance to each chart is what makes vertical alignment
 * exact rather than approximate: identical left gutter, identical pixels per
 * day, so a column and the weight point above it refer to the same date.
 */
export interface DayScale {
  from: string;
  to: string;
  width: number;
  left: number;
  right: number;
  count: number;
  /** Centre of a day's band. */
  x: (day: string) => number;
  /** Width of one day's band. */
  band: number;
  /** The day under a pixel position, clamped to the range. */
  dayAt: (px: number) => string;
  /** Week-start days for axis labels. */
  ticks: () => string[];
}

const dayIndex = (from: string, day: string) =>
  Math.round((parseDay(day).getTime() - parseDay(from).getTime()) / 86400000);

export function makeDayScale(
  from: string, to: string, width: number, left: number, right: number,
): DayScale {
  const count = dayIndex(from, to) + 1;
  const span = width - left - right;
  const band = span / Math.max(count, 1);

  return {
    from, to, width, left, right, count, band,
    x: (day) => left + (dayIndex(from, day) + 0.5) * band,
    dayAt: (px) => {
      const index = Math.floor((px - left) / band);
      return shiftDay(from, Math.max(0, Math.min(count - 1, index)));
    },
    ticks: () => {
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const day = shiftDay(from, i);
        if (parseDay(day).getDay() === 1) out.push(day);
      }
      // Label the range start too, but only when it is far enough from the
      // first Monday to not collide with it.
      const firstMonday = out[0];
      const offset = firstMonday
        ? Math.round((parseDay(firstMonday).getTime() - parseDay(from).getTime()) / 86400000)
        : count;
      if (offset >= 4) out.unshift(from);
      // Thin the labels until they cannot collide at ~52px each.
      const max = Math.max(2, Math.floor(span / 52));
      if (out.length <= max) return out;
      const step = Math.ceil(out.length / max);
      return out.filter((_, i) => i % step === 0);
    },
  };
}

/** A nice round axis step covering `span` in roughly `count` lines. */
export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(count, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw || 1));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (magnitude * factor >= raw) return magnitude * factor;
  }
  return magnitude * 10;
}
