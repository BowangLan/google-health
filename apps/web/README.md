# Health web app

React + TypeScript on Vite. The Python server in `apps/cli/src/healthsync/web.py` reads the
local records and runs `hsync` for commands that reach Google Health.

## UI component setup

Tailwind CSS v4 runs through the existing `@tailwindcss/vite` plugin. Component
layouts, typography, SVG chart styling, interactive states, and responsive
changes use utility classes. `src/styles.css` defines the palette with
`@theme inline`, element defaults, animation keyframes, and accessibility
preferences. Preflight remains disabled to preserve native controls and the
existing dashboard appearance. Pointer hover styles apply only to a fine
pointer that supports hovering.

`components.json` retains the shadcn aliases. Both TypeScript and Vite resolve
`@/` to `src/`. Import modules directly; there are no barrel files. The `cn`
helper in `src/lib/utils.ts` combines `clsx` and `tailwind-merge`. Shared
capsule controls use `src/components/button.tsx`; shared fields and form layout
utilities live in `src/components/forms`. CLI-owned or supplied UI primitives
remain in `src/components/ui`.

The nutrition tile uses `src/components/ui/apple-activity-ring.tsx`, adapted
from the MIT-licensed Kokonut UI component supplied for this app. Its
`activities` prop accepts label, percentage, color, size, current, target, and
unit; optional `endColor` controls the gradient. A null percentage represents
an unavailable target. Energy uses eaten/burned calories and protein uses the
configured daily goal. Both keep animating through multiple laps, with the
overflow painted over the completed ring. `compact`, `ringSize`, `strokeWidth`,
and custom legend children fit it into the existing responsive nutrition tile.
It uses Framer Motion hooks with no context provider, images, or icons required.
Reduced motion and keyboard input show progress immediately.

`src/components/ui/demo.tsx` exports the supplied standalone demo with the
original Move, Exercise, and Stand data. Import it into a page to display the
full card. The main dashboard supplies live nutrition data instead.

For a fresh Vite project, the equivalent setup is:

```sh
pnpm create vite health-web --template react-ts
cd health-web
pnpm install
pnpm add -D tailwindcss @tailwindcss/vite
# Configure the Vite plugin, CSS imports, and @/ alias as in this repo.
pnpm dlx shadcn@latest init
pnpm add framer-motion clsx tailwind-merge
```

This repository already includes that configuration; run `bun install` to
restore its dependencies. See the official [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite),
[Preflight import options](https://tailwindcss.com/docs/preflight), and
[shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite).

## Running

From the repository root:

```sh
bun install
bun start        # builds dist/, then `uv run hsync web` serves it
```

Open the URL it prints. For UI development, `bun dev` runs the API server and
Vite together; Vite proxies `/api` to port 8787. `bun run typecheck` checks TypeScript.

## Workflows and state

The app is one dashboard. It has one selected day, which defaults to today, and
one trend range (30, 90, 180 or 365 days ending today). Both live in the URL
hash as `#/?date=YYYY-MM-DD&days=N`, so reloads, direct links and browser Back
restore them. Older `#/journal?date=` and `#/trends?days=&day=` links still
resolve.

The left column shows the selected day: energy and protein rings against the
daily targets, the macro split, weigh-ins, calories burned from Google Health,
and the food log by meal. The right column shows the range: four summary
figures and the weight, calories and protein charts. Hovering a chart previews
a day's readings. Clicking a chart selects that day for the whole dashboard.
The arrows, the calendar dialog and the keyboard change the same day.
Browsing a calendar month changes nothing until a date is chosen. The weight
form logs to the selected day. Date and time are the first fields in the food
composer, visible before searching and preserved while choosing foods. They
default to today and the current Pacific time, including when reusing food
or browsing an older day. Saving food selects its logged date. Reuse opens an
editable form before saving; it never logs on a single click. New food
defaults to Anytime and requires calories and all three macros.

The top bar holds the brand, the Dynamic Island, and Activity, Settings and
Shortcuts. The island is a black capsule modelled on the iPhone's: at rest it
shows Google Health sync status, while a command runs it shows a waveform, and
notices grow it into a card for a few seconds. Clicking it opens the sync
sheet, which grows out of the same spot.

Sync runs by itself in one direction only. When the window regains focus,
and at least 45 seconds have passed since the last sync, it runs
`hsync sync --all --pull`: a comparison with Google Health, then a pull that
keeps local edits and deletions. Loading or reloading the app does not sync.
The island shows the outcome and when it
last ran, and the dashboard reloads only when records actually changed. Push
never happens on its own. The Google Health panel lists every local change;
its push button pulls first and then sends them, and pending deletions reach
Google Health only with the confirmation box ticked. Conflicts, recovery, and
unreadable files appear under Needs attention with the fields that differ.
The panel never passes `--force`; the text says how to resolve from a terminal.

The interface is dark only. Chrome is monochrome with white primary actions;
colour is kept for data, using Apple's dark-mode system colours (energy pink,
protein cyan, carbs orange, fat yellow, weight purple) and no green. Controls
are capsules, tiles have 22px corners. Motion uses spring curves written as CSS
`linear()` easing. Dialogs contain focus and restore it when closed. Keyboard
use and reduced-motion preferences suppress movement; reduced transparency
makes the top bar solid. Below 520px the island moves to its own row under the
brand and buttons. The Apple reference images used for the design are
Apple's copyright, so they are kept out of the repository.

## Code structure

The web app follows the `react-project-structure` skill: kebab-case filenames,
named component exports, direct imports, and code colocated with its domain.
Only the folders needed by this app are present.

```text
src/
  main.tsx
  app/
    app.tsx                       app shell and composition
    routes/dashboard.tsx          composes journal and trends
    components/shortcut-sheet.tsx
  features/
    journal/
      components/                 day, calendar and record forms
      hooks/use-journal.ts
    trends/
      components/                 summary and charts
      lib/                        series calculations and date scales
    sync/
      components/                 island and sync panel
      hooks/                      sync execution and relative time
      lib/status.ts               counts, notices and status summaries
    activity/
      components/activity-panel.tsx
      hooks/use-activity.ts
    settings/
      components/settings-popover.tsx
  components/
    button.tsx  dialog.tsx         shared controls
    forms/                        field, text field and segmented control
    ui/                           supplied UI primitives
  hooks/                          shared account metadata and routing
  lib/                            API contract, formatting and shared helpers
  styles.css                      Tailwind theme and global defaults
```

Shared modules do not import domains. A domain imports shared modules and its
own files; it never imports another domain. The app shell and dashboard route
compose the domains. `src/lib/types.ts` holds the server's JSON contract, and
`src/lib/api.ts` remains the only module that calls `fetch`.

`src/hooks/use-health.ts` holds metadata, targets, and the local sync overview.
`src/hooks/use-route.ts` manages the URL. The journal hook fetches the selected
day and rejects stale responses; `day.tsx` draws its tiles and food log.
`trends-section.tsx` owns series loading, range selection, and chart hover.
The trend helpers retain the centred seven-day mean, missing-data rules, and
average denominators; chart clicks select the dashboard's day.

The sync hook runs one operation at a time and pulls automatically on focus.
`status.ts` derives messages independently of the panel. Activity holds the
command log and notifications; its notification type is part of the shared
contract so sync does not depend on the activity domain. `src/lib/icons.ts`
continues to centralize icon exports.

Adding a record runs a CLI command and can sync that new record immediately.
Editing and deleting call `/api/record`; the server takes the collection lock
and refuses changes the sync engine cannot reconcile. Those local changes wait
in the Google Health panel for an explicit push. Syncing calls `/api/sync`,
which runs the real `sync` command and returns its output both raw and parsed
by `apps/cli/src/healthsync/sync_report.py`. The server runs one CLI process at a time, so
a sync started by regaining focus delays a new entry by a few seconds rather
than failing it on the collection lock. The UI never passes `--force`.

## Browser checks

```sh
bun run test:e2e
```

The Playwright suite requires Google Chrome installed locally. It builds and
serves an isolated production preview on port 42931 and intercepts every API
request with fixtures. Tests do not read or mutate real health logs. Coverage
includes the single dashboard and legacy links, history and reloads, backdated logging and reuse,
edit/delete flows, failure recovery, keyboard focus, and responsive dark styling.
