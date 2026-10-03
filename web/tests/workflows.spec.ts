import { test, expect } from "@playwright/test";
import { food, mockHealth, shift, TODAY, PAST } from "./fixtures";

test("one dashboard shows the selected day beside its trends, with no page navigation", async ({
  page,
}) => {
  await mockHealth(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Weight & nutrition", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Journal", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Trends", exact: true })).toHaveCount(0);
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.locator("time[datetime='" + TODAY + "']").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Google Health sync/ }),
  ).toBeVisible();
});

test("old journal and trends links open the dashboard on the right day and range", async ({
  page,
}) => {
  await mockHealth(page);
  await page.goto("/#/?date=" + PAST);
  await expect(page.locator(".day-title time[datetime='" + PAST + "']")).toBeVisible();
  await page.goto("/#/trends?days=30&day=" + PAST);
  await expect(page.locator(".day-title time[datetime='" + PAST + "']")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "30d", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("date browsing is local and changes the dashboard only after choosing a date", async ({
  page,
}) => {
  await mockHealth(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Choose date/ }).click();
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "August 2026", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/date=/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".day-title time[datetime='" + TODAY + "']")).toBeVisible();
  await page.getByRole("button", { name: /Choose date/ }).click();
  await page.getByLabel("Go to date", { exact: true }).fill(PAST);
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page).toHaveURL(/date=2026-09-24/);
  await expect(page.locator(".day-title time[datetime='" + PAST + "']")).toBeVisible();
  await expect(
    page.getByText(/New weight entries will be logged to Thursday, September 24, 2026/),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".day-title time[datetime='" + PAST + "']")).toBeVisible();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.locator(".day-title time[datetime='" + TODAY + "']")).toBeVisible();
});

test("food and reused food use editable dates and times; weight uses the selected day", async ({
  page,
}) => {
  const state = await mockHealth(page);
  await page.clock.setFixedTime(new Date("2026-09-26T01:45:00Z"));
  await page.goto("/#/?date=" + PAST);
  await page.getByRole("button", { name: "Log food", exact: true }).click();
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(TODAY);
  await expect(page.getByLabel(/^Time/)).toHaveValue("18:45");
  await page.getByLabel("Date", { exact: true }).fill(PAST);
  await page.getByLabel(/^Time/).fill("09:15");
  await page.getByLabel("What did you eat?").fill("Test dinner");
  await page
    .getByRole("button", { name: "New food “Test dinner”", exact: true })
    .click();
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(PAST);
  await expect(page.getByLabel(/^Time/)).toHaveValue("09:15");
  await page.getByRole("button", { name: "Back to food search", exact: true }).click();
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(PAST);
  await expect(page.getByLabel(/^Time/)).toHaveValue("09:15");
  await page.getByLabel("What did you eat?").fill("Rice bowl");
  await page.getByRole("button", { name: /^Rice bowl 600/ }).click();
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(PAST);
  await expect(page.getByLabel(/^Time/)).toHaveValue("09:15");
  await page.getByRole("button", { name: "Back to food search", exact: true }).click();
  await page.getByLabel("What did you eat?").fill("Test dinner");
  await page.getByRole("button", { name: "New food “Test dinner”", exact: true }).click();
  for (const [field, value] of [
    ["Calories", "400"],
    ["Protein", "25"],
    ["Carbs", "40"],
    ["Fat", "15"],
  ])
    await page.getByLabel(field, { exact: true }).fill(value);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Log food", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.writes.at(-1)?.body.values).toMatchObject({
    date: PAST,
    at: "09:15",
    name: "Test dinner",
    protein: "25",
    carbs: "40",
    fat: "15",
  });
  await page
    .getByRole("button", { name: "Reuse Rice bowl", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Reuse food", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Rice bowl",
  );
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(TODAY);
  await page.getByLabel("Date", { exact: true }).fill(PAST);
  await page.getByLabel(/^Time/).fill("18:30");
  await page.getByLabel("Amount", { exact: true }).fill("2");
  await expect(page.getByLabel("Calories", { exact: true })).toHaveValue(
    "1200",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Log food", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.writes.at(-1)?.body).toMatchObject({
    command: "add",
    values: { date: PAST, at: "18:30", amount: "2", kcal: "1200", protein: "70" },
  });
  await page
    .locator(".log-actions")
    .getByRole("button", { name: "Log weight", exact: true })
    .click();
  await page.getByLabel("Weight", { exact: true }).fill("185");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Log weight", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.writes.at(-1)?.body).toMatchObject({
    collection: "weight",
    command: "add",
    values: { date: PAST, value: "185", unit: "lb" },
  });
});

test.describe("food defaults in another browser timezone", () => {
  test.use({ timezoneId: "Asia/Tokyo" });

  test("reuse defaults to today and Pacific time, validates the date, and shows the saved day", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-26T01:45:00Z"));
    const state = await mockHealth(page);
    await page.goto("/#/?date=" + PAST);
    await page.getByRole("button", { name: "Reuse Rice bowl", exact: true }).click();
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue(TODAY);
    await expect(page.getByLabel(/^Time/)).toHaveValue("18:45");
    await page.getByLabel("Date", { exact: true }).fill("");
    await page.getByRole("dialog").getByRole("button", { name: "Log food", exact: true }).click();
    expect(state.writes).toHaveLength(0);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Date", { exact: true }).fill(TODAY);
    await page.getByRole("dialog").getByRole("button", { name: "Log food", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(state.writes.at(-1)?.body).toMatchObject({
      command: "add",
      values: { date: TODAY, at: "18:45", name: "Rice bowl" },
    });
    await expect(page.locator(".day-title time[datetime='" + TODAY + "']")).toBeVisible();
    await expect(page.locator(".island")).toContainText("Friday, September 25, 2026 · 18:45");
  });
});

test("clicking a chart selects that day for the whole dashboard; range survives reloads", async ({
  page,
}) => {
  const state = await mockHealth(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Weight & nutrition", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "30d", exact: true }).click();
  await expect(page).toHaveURL(/days=30/);
  const reads = state.dayReads.length;
  await page
    .locator(".viz-svg")
    .first()
    .click({ position: { x: 180, y: 70 } });
  await expect(page).toHaveURL(/date=2026-\d\d-\d\d&days=30/);
  await expect.poll(() => state.dayReads.length).toBeGreaterThan(reads);
  const picked = new URL(page.url()).hash.match(/date=([\d-]+)/)![1]!;
  await expect(page.locator(".day-title time[datetime='" + picked + "']")).toBeVisible();
  await expect(
    page.getByText(/New weight entries will be logged to/),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".day-title time[datetime='" + picked + "']")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "30d", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("day shortcuts work, modal focus is contained, and no numeric key logs food", async ({
  page,
}) => {
  const state = await mockHealth(page);
  await page.goto("/#/?date=" + PAST);
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("1");
  expect(state.writes).toHaveLength(0);
  await page.keyboard.press("f");
  await expect(page.getByLabel("Date", { exact: true })).toBeFocused();
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest("dialog")),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/date=2026-09-23/);
  await page.keyboard.press("t");
  await expect(page.locator(".day-title time[datetime='" + TODAY + "']")).toBeVisible();
  await page.keyboard.press("p");
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Google Health", exact: true }),
  ).toBeVisible();
});

test("late day responses, day failures, and empty days stay in the current context", async ({
  page,
}) => {
  const state = await mockHealth(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toBeVisible();
  state.delayDay = PAST;
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await page.getByRole("button", { name: "Next day", exact: true }).click();
  await expect(page.locator(".day-title time[datetime='" + TODAY + "']")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator(".day-title time[datetime='" + TODAY + "']")).toBeVisible();
  state.failDay = PAST;
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "This day couldn’t be loaded.",
  );
  state.failDay = null;
  state.empty = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "No food logged for this day.",
      exact: true,
    }),
  ).toBeVisible();
});

test("editing and deleting keep sync consequences; failed logging stays recoverable", async ({
  page,
}) => {
  const state = await mockHealth(page);
  await page.goto("/#/?date=" + PAST);
  await page
    .getByRole("button", { name: "Edit Rice bowl", exact: true })
    .click();
  await page.getByLabel("Amount", { exact: true }).fill("2");
  await expect(page.getByLabel("Calories", { exact: true })).toHaveValue(
    "1200",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.writes.at(-1)?.body).toMatchObject({
    kind: "food",
    path: "food/" + PAST + ".md",
    values: { amount: "2" },
  });
  await page
    .getByRole("button", { name: "Delete Rice bowl", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Google Health keeps it until your next push",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.writes).toHaveLength(1);
  state.failWrite = true;
  await page
    .getByRole("button", { name: "Reuse Rice bowl", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Log food", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Test write failed",
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Log food", exact: true }),
  ).toBeEnabled();
});

test("dark-only styling fits every width from desktop to a small phone", async ({
  page,
}) => {
  await mockHealth(page);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).colorScheme),
  ).toBe("dark");
  await expect(
    page.getByRole("button", { name: /Switch to.*mode/ }),
  ).toHaveCount(0);
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Weight & nutrition", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      "Dashboard overflow at " + width,
    ).toBe(false);
    await expect(
      page.getByRole("button", { name: /Choose date/ }),
    ).toBeVisible();
    // The island never sits on top of the brand or the utility buttons.
    const island = await page.locator(".island").boundingBox();
    for (const selector of [".brand", ".utilities"]) {
      const other = await page.locator(selector).boundingBox();
      const overlap =
        island!.x < other!.x + other!.width &&
        other!.x < island!.x + island!.width &&
        island!.y < other!.y + other!.height &&
        other!.y < island!.y + island!.height;
      expect(overlap, `island overlaps ${selector} at ${width}`).toBe(false);
    }
  }
  await page.getByRole("button", { name: "Log food", exact: true }).click();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth > el.clientWidth + 1),
  ).toBe(false);
  for (const width of [1440, 390, 320]) {
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Log food", exact: true }).click();
    const date = await page.getByLabel("Date", { exact: true }).boundingBox();
    const time = await page.getByLabel("Time (Pacific)", { exact: true }).boundingBox();
    if (width >= 520) {
      expect(Math.abs(date!.y - time!.y), "Date and time alignment at " + width).toBeLessThan(1);
    } else {
      expect(Math.abs(date!.x - time!.x), "Date and time alignment at " + width).toBeLessThan(1);
      expect(time!.y, "Time follows date at " + width).toBeGreaterThan(date!.y + date!.height);
      expect(date!.width, "Room for the full date at " + width).toBeGreaterThan(200);
      expect(time!.width, "Room for the full time at " + width).toBeGreaterThan(200);
    }
    expect(Math.abs(date!.height - time!.height), "Date and time height at " + width).toBeLessThan(1);
    const search = await page.getByLabel("What did you eat?").boundingBox();
    expect(search!.y - (time!.y + time!.height), "Gap before food search at " + width).toBeLessThan(45);
    expect(await page.getByRole("dialog").evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await page.getByRole("dialog").screenshot({ path: test.info().outputPath("food-composer-" + width + ".png") });
  }
});

test("the energy ring measures against calories burned and the budget uses the deficit goal", async ({
  page,
}) => {
  const state = await mockHealth(page);
  await page.goto("/");
  const nutrition = page.getByRole("region", { name: "Nutrition for selected day" });
  await expect(nutrition).toContainText("/ 2,400 kcal burned");
  await expect(nutrition).toContainText("25% of burned so far");
  // Today in the series: 1,800 + (89 % 4) * 100 eaten, 1,950 + (89 % 3) * 100 burned.
  const budget = page.locator(".stat.budget");
  await expect(budget).toContainText("2,150 burned, 1,900 eaten");
  await expect(budget).toContainText("250 kcal left");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Daily deficit goal (kcal)").fill("500");
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  expect(state.writes.at(-1)?.body).toMatchObject({ daily_deficit_kcal: "500" });
  await expect(budget).toContainText("250 kcal over");
  await expect(budget).toContainText("500 deficit");
});

test("the calorie chart draws burned as a line and highlights only intake above it", async ({
  page,
}) => {
  await mockHealth(page);
  await page.goto("/#/?days=30");
  await expect(page.locator(".viz-burned").first()).toBeVisible();
  // Days where eaten > burned in the fixture: (i%4)*100 + 1800 > 1950 + (i%3)*100.
  const expected = Array.from({ length: 30 }, (_, i) => i).filter(
    (i) => i >= 7 && 1800 + (i % 4) * 100 > 1950 + (i % 3) * 100,
  ).length;
  await expect(page.locator(".viz-over")).toHaveCount(expected);
  await expect(page.locator(".macro-legend .goal")).toBeVisible();
});

test("weight shows the change from the previous weigh-in and burned shows the coloured budget", async ({
  page,
}) => {
  await mockHealth(page);
  let eaten = 600;
  let previous = 186.0;
  await page.route("**/api/day?*", async (route) => {
    const day = new URL(route.request().url()).searchParams.get("date")!;
    await route.fulfill({
      json: {
        day,
        today: TODAY,
        timezone: "America/Los_Angeles",
        weight_unit: "lb",
        food: [{ ...food(day), kcal: eaten }],
        totals: { kcal: eaten, protein: 35, carbs: 70, fat: 20, sugar: 0, fiber: 0 },
        weights: [
          {
            state: "synced", id: "w", path: "weight/" + day + ".md",
            time: day + "T08:00:00-07:00", day, kg: 84, value: 185.2, unit: "lb",
            remote_note: "", note: "",
          },
        ],
        previous_weight: { day: shift(day, -1), time: shift(day, -1) + "T08:00", value: previous },
        burned: { kcal: 2400, fetched: day + "T20:00:00-07:00" },
        broken: [],
      },
    });
  });
  await page.goto("/");
  const weight = page.getByRole("region", { name: "Weight for selected day" });
  const burned = page.getByRole("region", { name: "Calories burned for selected day" });
  await expect(weight.locator(".delta.good")).toHaveText("−0.8 lb vs yesterday");
  await expect(burned.locator(".delta.good")).toHaveText("1,800 kcal left");
  const ratio = page.locator(".ring-legend .energy .ring-ratio");
  await expect(ratio).toHaveClass(/\bok\b/);
  await expect(ratio).toHaveText("25% of burned so far");

  // Within 10% of the 2,400 allowance: closing, yellow.
  eaten = 2200;
  previous = 184.0;
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(weight.locator(".delta.bad")).toHaveText("+1.2 lb vs yesterday");
  await expect(burned.locator(".delta.warn")).toHaveText("200 kcal under budget");
  await expect(ratio).toHaveClass(/\bclosing\b/);

  eaten = 2500;
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(burned.locator(".delta.bad")).toHaveText("100 kcal over budget");
  await expect(ratio).toHaveClass(/\bover\b/);
  await expect(ratio).toHaveText("104% of burned");
});
