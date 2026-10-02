import type { Page } from "@playwright/test";
import type {
  FoodRow,
  Kind,
  MonthView,
  Overview,
  Series,
  SyncCollection,
  Targets,
} from "../src/lib/types";

export const TODAY = "2026-09-25";
export const PAST = "2026-09-24";
export function shift(day: string, count: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function food(day: string): FoodRow {
  return {
    state: "synced",
    id: day,
    path: "food/" + day + ".md",
    time: day + "T12:30:00-07:00",
    day,
    meal: "LUNCH",
    name: "Rice bowl",
    kcal: 600,
    protein: 35,
    carbs: 70,
    fat: 20,
    sugar: 4,
    fiber: 5,
    sodium_mg: 400,
    amount: 1,
    unit: "bowl",
    identified: false,
    note: "",
  };
}
function month(which: string): MonthView {
  const first = which + "-01";
  const next = new Date(first + "T12:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = shift(next.toISOString().slice(0, 10), -1);
  const grid_start = shift(first, -new Date(first + "T12:00:00Z").getUTCDay());
  return {
    month: which,
    label: new Date(first + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    today: TODAY,
    first,
    last,
    grid_start,
    grid_end: shift(grid_start, 41),
    weight_unit: "lb",
    timezone: "America/Los_Angeles",
    broken: [],
    days: {
      [PAST]: {
        day: PAST,
        kcal: 600,
        protein: 35,
        carbs: 70,
        fat: 20,
        entries: 1,
        weight: null,
        weight_count: 0,
        states: {},
        worst: null,
      },
    },
  };
}
function series(days: number, targets: Targets): Series {
  const since = shift(TODAY, 1 - days);
  return {
    since,
    until: TODAY,
    today: TODAY,
    days,
    unit: "lb",
    timezone: "America/Los_Angeles",
    targets,
    rows: Array.from({ length: days }, (_, i) => ({
      day: shift(since, i),
      entries: 1,
      kcal: 1800 + (i % 4) * 100,
      protein: 100 + (i % 5) * 10,
      carbs: 170,
      fat: 65,
      fiber: 10,
      sugar: 20,
      sodium_mg: 500,
      unaccounted_kcal: 0,
      first_entry: "12:30",
      last_entry: "12:30",
      weight: 190 - i * 0.03,
      weight_readings: [{ time: "08:00", value: 190 - i * 0.03 }],
    })),
    gaps: [],
    coverage: { days_in_range: days, days_logged: days, days_weighed: days },
    broken: [],
  };
}

/** Both collections with nothing local to send. Tests mutate a copy. */
export function cleanOverview(): Overview {
  return {
    collections: (["food", "weight"] as Kind[]).map((kind) => ({
      kind,
      directory: kind,
      index: "index",
      timezone: "America/Los_Angeles",
      weight_unit: "lb",
      source: null,
      ghealth: "ghealth",
      synced: 10,
      edited: 0,
      new: 0,
      deleted: 0,
      awaiting: 0,
      pending: 0,
      details: {
        edited: [],
        new: [],
        deleted: [],
        awaiting: [],
        pending: [],
        broken: [],
      },
    })),
  };
}

/** One collection's part of a sync report: checked, matching, pulled nothing. */
export function syncCollection(
  kind: Kind,
  extra: Partial<SyncCollection> = {},
): SyncCollection {
  return {
    kind,
    checked: true,
    since: shift(TODAY, -30),
    until: TODAY,
    incoming: [],
    outgoing: [],
    attention: [],
    comparison: { matched: 10, different: 0, missing: 0, remote_only: 0 },
    ran: ["pull"],
    pull: { fetched: 0, saved: 0, removed: 0, held: 0 },
    push: null,
    dry_run: false,
    events: [],
    deletions: [],
    deletions_held: false,
    notes: [],
    error: null,
    ...extra,
  };
}

/** Every /api request is fulfilled here. Tests cannot write local or remote health data. */
export async function mockHealth(page: Page) {
  const state = {
    writes: [] as { method: string; path: string; body: any }[],
    dayReads: [] as string[],
    failDay: null as string | null,
    delayDay: null as string | null,
    failWrite: false,
    empty: false,
    targets: {
      daily_kcal: 2000,
      daily_protein_g: 150,
      weight_unit: "lb",
    } as Targets,
    overview: cleanOverview(),
    /** Every POST /api/sync body, in order. Syncs are not record writes. */
    syncCalls: [] as Record<string, unknown>[],
    failSync: false,
    /** The next sync responses report these collections; null means clean. */
    syncCollections: null as SyncCollection[] | null,
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (req.method() !== "GET") {
      const body = req.postDataJSON();
      if (url.pathname === "/api/sync") {
        state.syncCalls.push(body);
        const command = "./hsync sync --all --pull --limit 500";
        if (state.failSync)
          return route.fulfill({
            json: {
              code: 1,
              stdout: "",
              stderr: "hsync: could not read credentials; run ghealth auth login\n",
              command,
              error: "could not read credentials; run ghealth auth login",
              collections: [
                syncCollection("food", { checked: false }),
                syncCollection("weight", { checked: false }),
              ],
              overview: state.overview,
            },
          });
        return route.fulfill({
          json: {
            code: 0,
            stdout: "food:\nfood sync · Checking Google Health…\n",
            stderr: "",
            command,
            error: null,
            collections: state.syncCollections ?? [
              syncCollection("food"),
              syncCollection("weight"),
            ],
            overview: state.overview,
          },
        });
      }
      state.writes.push({ method: req.method(), path: url.pathname, body });
      if (state.failWrite)
        return route.fulfill({
          status: 503,
          json: { error: "Test write failed" },
        });
      if (url.pathname === "/api/targets") {
        state.targets = {
          daily_kcal: Number(body.daily_kcal),
          daily_protein_g: Number(body.daily_protein_g),
          weight_unit: body.weight_unit,
        };
        return route.fulfill({ json: state.targets });
      }
      if (url.pathname === "/api/run")
        return route.fulfill({
          json: {
            code: 0,
            stdout: "Saved",
            stderr: "",
            command: "test " + body.command,
          },
        });
      if (url.pathname === "/api/record")
        return route.fulfill({
          json: { changed: true, staged_remote_delete: true },
        });
      return route.fulfill({
        status: 404,
        json: { error: "Unexpected mutation" },
      });
    }
    if (url.pathname === "/api/month")
      return route.fulfill({
        json: month(url.searchParams.get("month") ?? TODAY.slice(0, 7)),
      });
    if (url.pathname === "/api/targets")
      return route.fulfill({ json: state.targets });
    if (url.pathname === "/api/overview")
      return route.fulfill({ json: state.overview });
    if (url.pathname === "/api/foods") {
      const matches = "Rice bowl"
        .toLowerCase()
        .includes((url.searchParams.get("q") ?? "").toLowerCase())
        ? [{ ...food(TODAY), index: 1 }]
        : [];
      return route.fulfill({
        json: {
          matches,
          keyword: url.searchParams.get("q") ?? "",
          total: matches.length,
        },
      });
    }
    if (url.pathname === "/api/day") {
      const day = url.searchParams.get("date")!;
      state.dayReads.push(day);
      if (state.failDay === day)
        return route.fulfill({
          status: 500,
          json: { error: "Test day unavailable" },
        });
      if (state.delayDay === day) await new Promise((r) => setTimeout(r, 250));
      return route.fulfill({
        json: {
          day,
          today: TODAY,
          timezone: "America/Los_Angeles",
          weight_unit: "lb",
          food: state.empty ? [] : [food(day)],
          totals: state.empty
            ? { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 }
            : {
                kcal: 600,
                protein: 35,
                carbs: 70,
                fat: 20,
                sugar: 4,
                fiber: 5,
              },
          weights: [],
          broken: [],
        },
      });
    }
    if (url.pathname === "/api/series")
      return route.fulfill({
        json: series(Number(url.searchParams.get("days") ?? 90), state.targets),
      });
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected test API request" },
    });
  });
  return state;
}
