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

Journal is the default destination and opens today. Its date bar owns date
navigation and the calendar dialog. Browsing a calendar month does not change
the journal until a date is chosen. Meals, daily totals, weigh-ins, and logging
actions all belong to the displayed day. Food and weight forms repeat that date.
Reuse opens an editable form before saving; it never logs on a single click.
New food defaults to Anytime and requires calories and all three macros.

Trends owns its time range and inspected date. Hover previews readings, clicking
pins a day, and an explicit link opens that day's Journal. It contains no second
journal or logging form. Range summaries are independent of the inspected day.

The sidebar contains only Journal, Trends, and global Activity, Settings,
Shortcuts, and the Google Health status. Page-specific date controls and
keyboard shortcuts stay inside their page. Journal and Trends encode their
state separately in the URL hash, so reloads, direct links, and browser Back
restore the right context.

Sync runs by itself in one direction only. When the app opens, and whenever
the window regains focus after at least 45 seconds, it runs
`hsync sync --all --pull`: a comparison with Google Health, then a pull that
keeps local edits and deletions. The sidebar shows the outcome and when it
last ran, and the journal reloads only when records actually changed. Push
never happens on its own. The Google Health panel lists every local change;
its push button pulls first and then sends them, and pending deletions reach
Google Health only with the confirmation box ticked. Conflicts, recovery, and
unreadable files appear under Needs attention with the fields that differ.
The panel never passes `--force`; the text says how to resolve from a terminal.

The interface is dark only, with neutral surfaces, white primary actions, and
no green colors. Dialogs contain focus and restore it when closed. Pointer
transitions are brief; keyboard use and reduced-motion preferences suppress
movement. On narrow screens the global navigation becomes a top bar, while
page controls remain with their content.

## Code structure

- `src/lib/types.ts` describes the server's JSON responses.
- `src/lib/api.ts` is the only module that calls `fetch`.
- `src/lib/navigation.ts` and `src/hooks/useRoute.ts` parse and manage routes.
- `src/hooks/useHealth.ts` holds global metadata, targets, and the local sync
  overview.
- `src/hooks/useSync.ts` runs one sync at a time, automatically on open and on
  focus, and keeps the last run. `src/components/Sync.tsx` derives the sidebar
  status and the panel from the overview plus that last run.
- `src/hooks/useJournal.ts` fetches the displayed day's records and rejects stale
  responses after navigation. `Journal.tsx` owns its dialogs and shortcuts.
- `Trends.tsx` owns series loading, range selection, and chart inspection.
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
includes page-local state, history and reloads, backdated logging and reuse,
edit/delete flows, failure recovery, keyboard focus, and responsive dark styling.
