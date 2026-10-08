import { expect, test, type Page } from "@playwright/test";
import { mockHealth, TODAY } from "./fixtures";

async function gaugeDay(page: Page, progress: () => number, burn: number | null = 2400) {
  await mockHealth(page);
  await page.route("**/api/day?*", async (route) => {
    const day = new URL(route.request().url()).searchParams.get("date")!;
    await route.fulfill({ json: {
      day, today: TODAY, timezone: "America/Los_Angeles", weight_unit: "lb",
      food: [], weights: [], previous_weight: null, broken: [],
      totals: { kcal: 2400 * progress(), protein: 150 * progress(), carbs: 0, fat: 0, sugar: 0, fiber: 0 },
      burned: burn === null ? null : { kcal: burn, fetched: day + "T20:00:00-07:00" },
    }});
  });
}
const progressRegion = (page: Page) => page.getByRole("region", { name: "Nutrition for selected day" });

test("Gauge UI shows actual amounts and reports excess without wrapping", async ({ page }) => {
  let progress = 1.5;
  await gaugeDay(page, () => progress);
  await page.goto("/");
  await expect(progressRegion(page)).toContainText("3,600");
  await expect(progressRegion(page)).toContainText("1,200 kcal over burned so far");
  await expect(progressRegion(page)).toContainText("75 g over target");
  progress = 3.25;
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(progressRegion(page)).toContainText("7,800");
  await expect(progressRegion(page)).toContainText("5,400 kcal over burned");
  await expect(progressRegion(page)).toContainText("337.5 g over target");
});

test("changing the protein goal updates progress without changing recorded grams", async ({ page }) => {
  await gaugeDay(page, () => 0.75);
  await page.goto("/");
  await expect(progressRegion(page)).toContainText("75% of target");
  for (const [target, expected] of [["75", "37.5 g over target"], ["150", "75% of target"]]) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Daily protein target (g)").fill(target!);
    await page.getByRole("button", { name: "Save targets", exact: true }).click();
    await expect(progressRegion(page)).toContainText(expected!);
    await expect(progressRegion(page)).toContainText("112.5");
  }
});

test("missing burn and protein target are unavailable rather than zero progress", async ({ page }) => {
  await gaugeDay(page, () => 0.75, null);
  await page.route("**/api/targets", (route) => route.fulfill({ json: {
    daily_kcal: null, daily_protein_g: null, daily_deficit_kcal: 0, weight_unit: "lb",
  }}));
  await page.goto("/");
  await expect(progressRegion(page)).toContainText("Burned not pulled yet");
  await expect(progressRegion(page)).toContainText("No target");
  await expect(progressRegion(page)).toContainText("1,800");
  await expect(progressRegion(page)).not.toContainText("0% of");
  await expect(page.getByRole("button", { name: "Open sync", exact: true })).toBeVisible();
});

test("gauges remain readable on a small phone and respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 900 });
  await gaugeDay(page, () => 5);
  await page.goto("/");
  await expect(progressRegion(page)).toContainText("12,000");
  await expect(progressRegion(page)).toContainText("9,600 kcal over burned so far");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const gauges = progressRegion(page).locator('dl[aria-label="Energy and protein progress"]');
  expect(await gauges.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await gauges.screenshot({ path: test.info().outputPath("gauge-phone.png") });
});
