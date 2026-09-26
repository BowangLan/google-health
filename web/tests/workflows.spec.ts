import { test, expect } from "@playwright/test";
import { mockHealth, TODAY, PAST } from "./fixtures";

test("Journal is the default, with global navigation and no duplicated dashboard", async ({
  page,
}) => {
  await mockHealth(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Journal", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toBeVisible();
  const sidebar = page.getByRole("complementary", {
    name: "Health navigation",
  });
  await expect(
    sidebar.getByRole("link", { name: "Journal", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("link", { name: "Trends", exact: true }),
  ).toBeVisible();
  await expect(sidebar.locator(".calendar")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".trends")).toHaveCount(0);
  await expect(page.locator("time[datetime='" + TODAY + "']")).toBeVisible();
});

test("date browsing is local and changes the journal only after choosing a date", async ({
  page,
}) => {
  await mockHealth(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Choose journal date/ }).click();
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "August 2026", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/date=/);
  await page.keyboard.press("Escape");
  await expect(page.locator("time[datetime='" + TODAY + "']")).toBeVisible();
  await page.getByRole("button", { name: /Choose journal date/ }).click();
  await page.getByLabel("Go to date", { exact: true }).fill(PAST);
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page).toHaveURL(/journal\?date=2026-09-24/);
  await expect(page.locator("time[datetime='" + PAST + "']")).toBeVisible();
  await expect(
    page.getByText(/New food and weight entries will be logged to this date/),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("time[datetime='" + PAST + "']")).toBeVisible();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.locator("time[datetime='" + TODAY + "']")).toBeVisible();
});

test("food, reused food and weight all go to the visibly selected historical date", async ({
  page,
}) => {
  const state = await mockHealth(page);
  await page.goto("/#/journal?date=" + PAST);
  await page.getByRole("button", { name: "Log food", exact: true }).click();
  await page.getByLabel("What did you eat?").fill("Test dinner");
  await page
    .getByRole("button", { name: "New food “Test dinner”", exact: true })
    .click();
  for (const [field, value] of [
    ["Calories", "400"],
    ["Protein", "25"],
    ["Carbs", "40"],
    ["Fat", "15"],
  ])
    await page.getByLabel(field, { exact: true }).fill(value);
  await expect(
    page
      .getByRole("dialog")
      .getByText(/Logging for Thursday, September 24, 2026/),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Log food", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.writes.at(-1)?.body.values).toMatchObject({
    date: PAST,
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
    values: { date: PAST, amount: "2", kcal: "1200", protein: "70" },
  });
  await page
    .locator(".journal-actions")
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

test("Trends owns range and chart inspection; only an explicit link opens Journal", async ({
  page,
}) => {
  const state = await mockHealth(page);
  await page.goto("/#/trends?days=90");
  await expect(
    page.getByRole("heading", { name: "Weight & nutrition", exact: true }),
  ).toBeVisible();
  expect(state.dayReads).toHaveLength(0);
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Log food", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "30d", exact: true }).click();
  await expect(
    page.getByText("30 days of weight and nutrition", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".viz-svg")
    .first()
    .click({ position: { x: 180, y: 70 } });
  await expect(page).toHaveURL(/trends\?days=30&day=/);
  expect(state.dayReads).toHaveLength(0);
  await page.getByLabel("Inspect a day in Trends", { exact: true }).fill(PAST);
  await expect(page).toHaveURL(/trends\?days=30&day=2026-09-24/);
  await page.keyboard.press("Tab");
  await page.keyboard.press("f");
  await page.keyboard.press("w");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.dayReads).toHaveLength(0);
  await page
    .getByRole("link", { name: "Open Sep 24 in Journal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toBeVisible();
  await expect(page.locator("time[datetime='" + PAST + "']")).toBeVisible();
  await page.goBack();
  await expect(
    page.getByLabel("Inspect a day in Trends", { exact: true }),
  ).toHaveValue(PAST);
  await expect(
    page.getByRole("button", { name: "30d", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByLabel("Inspect a day in Trends", { exact: true }),
  ).toHaveValue(PAST);
});

test("journal shortcuts are scoped, modal focus is contained, and no numeric key logs food", async ({
  page,
}) => {
  const state = await mockHealth(page);
  await page.goto("/#/journal?date=" + PAST);
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("1");
  expect(state.writes).toHaveLength(0);
  await page.keyboard.press("f");
  await expect(page.getByLabel("What did you eat?")).toBeFocused();
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
  await expect(page.locator("time[datetime='" + TODAY + "']")).toBeVisible();
  await page.keyboard.press("g");
  await expect(
    page.getByRole("heading", { name: "Trends", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("j");
  await expect(
    page.getByRole("heading", { name: "Journal", exact: true }),
  ).toBeVisible();
});

test("late day responses, day failures, and empty journals stay in the current context", async ({
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
  await expect(page.locator("time[datetime='" + TODAY + "']")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Food log", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator("time[datetime='" + TODAY + "']")).toBeVisible();
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
  await page.goto("/#/journal?date=" + PAST);
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

test("dark-only neutral styling and page-local controls work at desktop and mobile widths", async ({
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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      "Journal overflow at " + width,
    ).toBe(false);
    await expect(
      page.getByRole("button", { name: /Choose journal date/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Trends", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Weight & nutrition", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      "Trends overflow at " + width,
    ).toBe(false);
    await page.getByRole("link", { name: "Journal", exact: true }).click();
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
});
