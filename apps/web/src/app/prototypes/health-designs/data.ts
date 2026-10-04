import type { DemoFood, DemoWeight, DemoTrend, DemoTotals } from "./types";
import { shiftDate } from "./types";

export const DEMO_TODAY = "2026-10-03";
export const TARGETS: DemoTotals = { kcal: 2200, protein: 140, carbs: 250, fat: 75 };
export const FOOD_LIBRARY: Omit<DemoFood, "id" | "day" | "state">[] = [
  { name: "Greek yogurt & overnight oats", meal: "Breakfast", time: "08:15", amount: 1, unit: "bowl", kcal: 385, protein: 24, carbs: 49, fat: 11 },
  { name: "Flat white", meal: "Breakfast", time: "08:20", amount: 1, unit: "cup", kcal: 45, protein: 3, carbs: 5, fat: 2 },
  { name: "Chicken, avocado & rice bowl", meal: "Lunch", time: "12:35", amount: 1, unit: "bowl", kcal: 690, protein: 44, carbs: 71, fat: 25 },
  { name: "Cottage cheese & blueberries", meal: "Anytime", time: "15:10", amount: 1, unit: "bowl", kcal: 215, protein: 19, carbs: 18, fat: 8 },
  { name: "Salmon with roasted potatoes", meal: "Dinner", time: "19:20", amount: 1, unit: "plate", kcal: 625, protein: 42, carbs: 49, fat: 29 },
  { name: "Single ShackBurger, lettuce wrap", meal: "Lunch", time: "13:00", amount: 1, unit: "burger", kcal: 330, protein: 23, carbs: 3, fat: 25 },
];
export function seedData(): { foods: DemoFood[]; weights: DemoWeight[] } {
  const foods: DemoFood[] = [], weights: DemoWeight[] = [];
  for (let offset = 179; offset >= 0; offset--) {
    const day = shiftDate(DEMO_TODAY, -offset);
    if (offset === 0 || offset % 11 !== 3) {
      const variation = offset === 0 ? 1 : 1 + Math.sin(offset * .8) * .12;
      FOOD_LIBRARY.slice(0, offset === 0 ? 4 : 5).forEach((food, i) => foods.push({ ...food, id: `seed-food-${day}-${i}`, day, state: offset === 0 && i === 3 ? "local" : "synced", kcal: Math.round(food.kcal * variation), protein: Math.round(food.protein * variation), carbs: Math.round(food.carbs * variation), fat: Math.round(food.fat * variation) }));
    }
    if (offset % 2 === 0 && offset % 13 !== 4) weights.push({ id: `seed-weight-${day}`, day, time: "07:10", value: Number((171.8 + offset * 4 / 179 + Math.sin(offset * .55) * .4).toFixed(1)), unit: "lb", state: "synced" });
  }
  return { foods, weights };
}
export function totalFoods(foods: DemoFood[]): DemoTotals {
  return foods.reduce((t, f) => ({ kcal: t.kcal + f.kcal, protein: t.protein + f.protein, carbs: t.carbs + f.carbs, fat: t.fat + f.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}
export function makeHistory(foods: DemoFood[], weights: DemoWeight[], range: number): DemoTrend[] {
  const foodMap = new Map<string, DemoFood[]>(), weightMap = new Map<string, number>();
  for (const f of foods) { const items = foodMap.get(f.day) ?? []; items.push(f); foodMap.set(f.day, items); }
  for (const w of weights) weightMap.set(w.day, w.unit === "kg" ? w.value * 2.2046226218 : w.value);
  return Array.from({ length: range }, (_, i) => {
    const day = shiftDate(DEMO_TODAY, i - range + 1), daily = foodMap.get(day);
    const totals = daily ? totalFoods(daily) : null;
    const window = Array.from({ length: 7 }, (_, k) => weightMap.get(shiftDate(day, k - 3))).filter((n): n is number => n !== undefined);
    return { day, weight: weightMap.get(day) ?? null, trend: weightMap.has(day) && window.length >= 3 ? window.reduce((a,b) => a+b,0) / window.length : null, kcal: totals?.kcal ?? null, protein: totals?.protein ?? null, carbs: totals?.carbs ?? null, fat: totals?.fat ?? null };
  });
}
