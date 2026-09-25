export function num(value: number | null | undefined, digits = 0): string | null {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Number(Number(value).toFixed(digits)).toLocaleString();
}

export const iso = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

/** Parsed at midday so daylight saving never shifts the calendar date. */
export const parseDay = (day: string): Date => new Date(`${day}T12:00:00`);

export function shiftDay(day: string, days: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + days);
  return iso(date);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year!, (index ?? 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function relativeDay(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  const days = Math.round((parseDay(day).getTime() - parseDay(today).getTime()) / 86400000);
  return days < 0 ? `${-days} days ago` : `in ${days} days`;
}

export const clock = (time: string): string => time.slice(11, 16);

export const lastLine = (...texts: (string | undefined)[]): string => {
  for (const text of [...texts].reverse()) {
    const line = (text || "").trim().split("\n").filter(Boolean).pop();
    if (line) return line.replace(/\s+/g, " ").slice(0, 160);
  }
  return "";
};

export const MEALS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK", "ANYTIME"] as const;

export const MEAL_NAME: Record<string, string> = {
  BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner",
  SNACK: "Snack", ANYTIME: "Anytime",
};

export function guessMeal(isToday: boolean): string {
  if (!isToday) return "ANYTIME";
  const hour = new Date().getHours();
  if (hour < 10) return "BREAKFAST";
  if (hour < 15) return "LUNCH";
  if (hour < 21) return "DINNER";
  return "SNACK";
}
