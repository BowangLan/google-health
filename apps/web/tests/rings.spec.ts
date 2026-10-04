import { test, expect, type Page } from "@playwright/test";
import { mockHealth, TODAY } from "./fixtures";

async function ringDay(page: Page, progress: () => number) {
  await mockHealth(page);
  await page.route("**/api/day?*", async (route) => {
    const day = new URL(route.request().url()).searchParams.get("date")!;
    await route.fulfill({
      json: {
        day,
        today: TODAY,
        timezone: "America/Los_Angeles",
        weight_unit: "lb",
        food: [],
        weights: [],
        broken: [],
        totals: {
          kcal: 2400 * progress(), protein: 150 * progress(),
          carbs: 0, fat: 0, sugar: 0, fiber: 0,
        },
        burned: { kcal: 2400, fetched: day + "T20:00:00-07:00" },
      },
    });
  });
}

async function freezeClock(page: Page) {
  const time = new Date("2026-09-25T12:00:00-07:00");
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
}

async function frames(page: Page, selector = ".activity-ring") {
  return page.locator(selector).evaluateAll((rings) => rings.map((ring) => {
    const circles = ring.querySelectorAll(".ring-value");
    const percent = (circle: Element) => {
      const style = getComputedStyle(circle);
      const circumference = parseFloat(style.strokeDasharray);
      return (1 - parseFloat(style.strokeDashoffset) / circumference) * 100;
    };
    return {
      animations: ring.getAnimations({ subtree: true }).length,
      first: percent(circles[0]),
      firstOpacity: Number(getComputedStyle(circles[0]).opacity),
      overflow: percent(circles[1]),
      overflowOpacity: Number(getComputedStyle(circles[1]).opacity),
    };
  }));
}

test("ring animation completes the first lap before drawing overflow", async ({ page }) => {
  await freezeClock(page);
  await ringDay(page, () => 1.5);
  await page.goto("/");
  await expect(page.locator(".ring-legend .energy")).toContainText("150% of burned");
  await page.clock.runFor(600);
  for (const frame of await frames(page)) {
    expect(frame.first).toBeGreaterThan(0);
    expect(frame.first).toBeLessThan(100);
    expect(frame.overflow).toBeCloseTo(0, 3);
    expect(frame.overflowOpacity).toBe(0);
  }
  await page.clock.runFor(1000);
  for (const frame of await frames(page)) {
    expect(frame.first).toBeCloseTo(100, 3);
    expect(frame.overflow).toBeGreaterThan(0);
    expect(frame.overflow).toBeLessThan(50);
    expect(frame.overflowOpacity).toBe(1);
  }
  await page.clock.runFor(600);
  for (const frame of await frames(page)) {
    expect(frame.first).toBeCloseTo(100, 3);
    expect(frame.overflow).toBeCloseTo(50, 3);
  }
});

test("ring progress crosses 100% in both directions when its target changes", async ({ page }) => {
  await freezeClock(page);
  await ringDay(page, () => 0.75);
  await page.goto("/");
  const ratio = page.locator(".ring-legend .protein .ring-ratio");
  await expect(ratio).toHaveText("75% of target");
  await page.clock.runFor(2200);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Daily protein target (g)").fill("75");
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(ratio).toHaveText("150% of target");
  await page.clock.runFor(1200);
  for (const frame of await frames(page, ".activity-ring.protein")) {
    expect(frame.first).toBeCloseTo(100, 3);
    expect(frame.overflow).toBeGreaterThan(0);
    expect(frame.overflow).toBeLessThan(50);
  }
  await page.clock.runFor(1000);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Daily protein target (g)").fill("150");
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(ratio).toHaveText("75% of target");
  await page.clock.runFor(1500);
  for (const frame of await frames(page, ".activity-ring.protein")) {
    expect(frame.first).toBeGreaterThan(75);
    expect(frame.first).toBeLessThan(100);
    expect(frame.overflow).toBeCloseTo(0, 3);
    expect(frame.overflowOpacity).toBe(0);
  }
});

test("reduced motion shows zero, complete and multiple laps immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let progress = 0;
  await ringDay(page, () => progress);
  await page.goto("/");
  for (const value of [0, 0.75, 1, 1.5, 2, 2.5, 3.25]) {
    if (value > 0) {
      progress = value;
      await page.getByRole("button", { name: "Previous day", exact: true }).click();
    }
    await expect(page.locator(".ring-legend .energy")).toContainText(`${value * 100}% of burned`);
    for (const frame of await frames(page)) {
      expect(frame.animations).toBe(0);
      expect(frame.first).toBeCloseTo(Math.min(value, 1) * 100, 3);
      expect(frame.firstOpacity).toBe(value > 0 ? 1 : 0);
      expect(frame.overflow).toBeCloseTo(value > 1 ? (value * 100 - 100) % 100 : 0, 3);
      expect(frame.overflowOpacity).toBe(value > 1 ? 1 : 0);
    }
  }
  await page.locator(".rings").screenshot({ path: test.info().outputPath("overflow.png") });
});

test("overflow covers the earlier lap without a shadow seam at its starting edge", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let progress = 1;
  await ringDay(page, () => progress);
  await page.goto("/");
  await expect(page.locator(".ring-legend .energy")).toContainText("100% of burned");
  const before = await page.locator(".rings").screenshot();
  progress = 1.5;
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.locator(".ring-legend .energy")).toContainText("150% of burned");
  const after = await page.locator(".rings").screenshot({
    path: test.info().outputPath("overlap.png"),
  });
  const pixels = await page.evaluate(async (images) => {
    return Promise.all(images.map(async (encoded) => {
      const image = new Image();
      image.src = "data:image/png;base64," + encoded;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      // Just behind the starting cap: only the moving tip should cast a shadow.
      return Array.from(context.getImageData(57, 7, 1, 1).data);
    }));
  }, [before.toString("base64"), after.toString("base64")]);
  expect(pixels[1]).toEqual(pixels[0]);
});
