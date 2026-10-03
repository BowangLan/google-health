# Health web app

React + TypeScript on Vite. The Python server in `healthsync/web.py` reads the
local records and runs `./hsync` for commands that reach Google Health.

## Running

From `web/`:

```sh
pnpm install
pnpm build      # writes dist/, which ./hweb serves
```

Then run `./hweb` from the repository root and open the URL it prints.
For UI development, keep that API server running and run `pnpm dev` from `web/`.
Vite proxies `/api` to port 8787. `pnpm typecheck` checks TypeScript.

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

- `src/lib/types.ts` describes the server's JSON responses.
- `src/lib/api.ts` is the only module that calls `fetch`.
- `src/lib/navigation.ts` and `src/hooks/useRoute.ts` parse and manage routes.
- `src/hooks/useHealth.ts` holds global metadata, targets, and the local sync
  overview.
- `src/hooks/useSync.ts` runs one sync at a time, automatically on
  focus, and keeps the last run. `src/components/Sync.tsx` derives the status
  summary and the sync sheet from the overview plus that last run.
  `Island.tsx` renders that summary and the notices.
- `src/hooks/useJournal.ts` fetches the selected day's records and rejects stale
  responses after navigation. `Dashboard.tsx` owns the day header, logging
  dialogs and shortcuts. `Day.tsx` draws the day's tiles and food log.
- `Trends.tsx` owns series loading, the range control, and chart hover. Chart
  clicks are reported to the dashboard, which selects the day.
- `src/hooks/useActivity.ts` holds the command log shown in the Activity dialog.
- `src/lib/series.ts` holds the centred seven-day mean, line-break rules, and
  average denominators. `src/lib/scale.ts` aligns dates across the chart stack.
- `src/lib/icons.ts` is the only module importing the icon library.

Adding a record runs a CLI command and can sync that new record immediately.
Editing and deleting call `/api/record`; the server takes the collection lock
and refuses changes the sync engine cannot reconcile. Those local changes wait
in the Google Health panel for an explicit push. Syncing calls `/api/sync`,
which runs the real `sync` command and returns its output both raw and parsed
by `healthsync/sync_report.py`. The server runs one CLI process at a time, so
a sync started by regaining focus delays a new entry by a few seconds rather
than failing it on the collection lock. The UI never passes `--force`.

## Browser checks

```sh
pnpm test:e2e
```

The Playwright suite requires Google Chrome installed locally. It builds and
serves an isolated production preview on port 42931 and intercepts every API
request with fixtures. Tests do not read or mutate real health logs. Coverage
includes the single dashboard and legacy links, history and reloads, backdated logging and reuse,
edit/delete flows, failure recovery, keyboard focus, and responsive dark styling.
