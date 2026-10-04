/** Throwaway visual designs. Every action stays in memory and never calls the health API. */
export type Meal = "Breakfast" | "Lunch" | "Dinner" | "Anytime";
export interface DemoFood {
  id: string; day: string; time: string; meal: Meal; name: string;
  amount: number; unit: string; kcal: number; protein: number; carbs: number; fat: number;
  state: "synced" | "local";
}
export interface DemoWeight {
  id: string; day: string; time: string; value: number; unit: "lb" | "kg"; state: "synced" | "local";
}
export interface DemoTotals { kcal: number; protein: number; carbs: number; fat: number; }
export interface DemoTrend {
  day: string; weight: number | null; trend: number | null;
  kcal: number | null; protein: number | null; carbs: number | null; fat: number | null;
}
export interface DesignProps {
  day: string; today: string; foods: DemoFood[]; weights: DemoWeight[];
  totals: DemoTotals; targets: DemoTotals; burned: number; history: DemoTrend[];
  range: number; pending: number; lastSynced: string;
  onDayChange: (day: string) => void; onChooseDate: () => void;
  onAddFood: () => void; onEditFood: (food: DemoFood) => void;
  onReuseFood: (food: DemoFood, draftDay?: string) => void; onAddWeight: () => void;
  onRangeChange: (days: number) => void; onSync: () => void;
}
export function shiftDate(day: string, delta: number): string {
  const date = new Date(day + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
export function dateLabel(day: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
export const MEALS: Meal[] = ["Breakfast", "Lunch", "Dinner", "Anytime"];
