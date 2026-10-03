/**
 * Calories left in a day: burned, minus eaten, minus the deficit goal.
 *
 * The status is what the colour shows:
 * - over: eaten more than the allowance (burned minus the deficit goal).
 * - closing: still under, but within a small meal of the line. That is 10% of
 *   the allowance, and at least 150 kcal so a low-burn day still gets warning.
 * - ok: comfortably under.
 *
 * Nothing eaten is never "over". Early in the day the burn so far can be
 * smaller than the deficit goal, which would otherwise read as over before
 * any food at all.
 */
export type BudgetState = "ok" | "closing" | "over";

export interface Budget {
  left: number;
  allowance: number;
  state: BudgetState;
}

export const CLOSING_SHARE = 0.1;
export const CLOSING_MIN_KCAL = 150;

export function budget(burned: number, eaten: number, deficit: number): Budget {
  const allowance = burned - deficit;
  const left = allowance - eaten;
  const margin = Math.max(CLOSING_MIN_KCAL, allowance * CLOSING_SHARE);
  const state: BudgetState =
    eaten > 0 && left < 0 ? "over" : eaten > 0 && left <= margin ? "closing" : "ok";
  return { left, allowance, state };
}
