import { test, expect } from "@playwright/test";
import { cleanOverview, mockHealth, syncCollection, TODAY } from "./fixtures";

const status = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /Google Health sync/ });

test("the app pulls on open, once per return to the window, and shows what arrived", async ({
  page,
}) => {
  await page.clock.install();
  const state = await mockHealth(page);
  const croissant = TODAY + "T08:31:00-07:00";
  const milk = TODAY + "T07:05:00-07:00";
  state.syncCollections = [
    syncCollection("food", {
      incoming: [
        {
          tag: "new",
          text: croissant + " · Butter Croissant · 288 kcal",
          phase: "compare",
          detail: "Butter Croissant · 288 kcal",
          time: croissant,
          diff: [],
        },
        {
          tag: "new",
          text: milk + " · Ultra-filtered Milk · 150 kcal",
          phase: "compare",
          detail: "Ultra-filtered Milk · 150 kcal",
          time: milk,
          diff: [],
        },
      ],
      pull: { fetched: 2, saved: 2, removed: 0, held: 0 },
    }),
    syncCollection("weight"),
  ];
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect.poll(() => state.syncCalls.length).toBe(1);
  expect(state.syncCalls[0]).toEqual({ collection: "all", pull: true });
  await expect(status(page)).toHaveAccessibleName(/Synced · just now/);
  await expect(page.locator(".island").getByRole("status")).toContainText(
    "2 records arrived from Google Health",
  );
  // Records arrived, so the displayed day reloaded once.
  await expect.poll(() => state.dayReads.length).toBe(2);

  // Coming straight back to the window shares the run that just finished.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(150);
  expect(state.syncCalls).toHaveLength(1);
  await page.clock.fastForward(60_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => state.syncCalls.length).toBe(2);
  expect(state.writes).toHaveLength(0);

  await page.keyboard.press("p");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Google Health", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("Pulled 2 records.");
  await expect(dialog).toContainText("Butter Croissant · 288 kcal");
  await expect(dialog).toContainText("Nothing waiting.");
  await expect(
    dialog.getByRole("button", { name: /^Push/ }),
  ).toHaveCount(0);
});

test("push is a button: local changes are listed and deletions confirmed explicitly", async ({
  page,
}) => {
  const state = await mockHealth(page);
  const [food, weight] = state.overview.collections;
  food!.new = 1;
  food!.details.new = ["Croissant · 288 kcal"];
  weight!.deleted = 1;
  weight!.details.deleted = ["88.5 kg"];
  await page.goto("/");
  await expect(status(page)).toHaveAccessibleName(/2 to push/);
  await status(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Croissant · 288 kcal");
  await expect(dialog).toContainText("88.5 kg");
  const confirm = dialog.getByRole("checkbox", { name: /Also delete 1 record/ });
  await expect(confirm).toBeChecked();
  const push = dialog.getByRole("button", {
    name: "Push 1 and delete 1",
    exact: true,
  });
  await expect(push).toBeEnabled();
  await confirm.uncheck();
  await expect(
    dialog.getByRole("button", { name: "Push 1 change", exact: true }),
  ).toBeEnabled();
  await confirm.check();

  state.overview = cleanOverview();
  state.syncCollections = [
    syncCollection("food", {
      ran: ["pull", "push"],
      push: { saved: 1, deleted: 0, absent: 0, recovered: 0, failed: 0 },
    }),
    syncCollection("weight", {
      ran: ["pull", "push"],
      push: { saved: 0, deleted: 1, absent: 0, recovered: 0, failed: 0 },
    }),
  ];
  await push.click();
  await expect.poll(() => state.syncCalls.length).toBe(2);
  expect(state.syncCalls[1]).toEqual({
    collection: "all",
    pull: true,
    push: true,
    yes: true,
  });
  await expect(dialog).toContainText("Sent 1 record, deleted 1 in Google Health.");
  await expect(dialog).toContainText("Nothing waiting.");
  await expect(status(page)).toHaveAccessibleName(/Synced/);
  expect(state.writes).toHaveLength(0);
});

test("a failed sync is visible and can be retried from the panel", async ({
  page,
}) => {
  const state = await mockHealth(page);
  state.failSync = true;
  await page.goto("/");
  await expect(status(page)).toHaveAccessibleName(/Sync failed/);
  await status(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "could not read credentials; run ghealth auth login",
  );
  state.failSync = false;
  await dialog.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect.poll(() => state.syncCalls.length).toBe(2);
  await expect(dialog).toContainText("Everything matches Google Health.");
  await expect(status(page)).toHaveAccessibleName(/Synced/);
});

test("conflicts and recovery show up as attention with the fields that differ", async ({
  page,
}) => {
  const state = await mockHealth(page);
  state.syncCollections = [
    syncCollection("food", {
      attention: [
        {
          tag: "conf",
          text: "2026-09-20/1230--soup--77.md",
          phase: "compare",
          path: "2026-09-20/1230--soup--77.md",
          detail: "",
          diff: [{ field: "kcal", local: "180", remote: "200" }],
        },
      ],
      comparison: { matched: 9, different: 1, missing: 0, remote_only: 0 },
    }),
    syncCollection("weight"),
  ];
  await page.goto("/");
  await expect(status(page)).toHaveAccessibleName(/Needs attention · 1 item/);
  await status(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("conflict");
  await expect(dialog).toContainText("kcal: 180 here, 200 in Google Health");
  await expect(dialog).toContainText("sync keeps both");
});
