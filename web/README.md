# Health web app

React + TypeScript on Vite. The backend is the Python server in
`healthsync/web.py`, which is the only thing that touches the record files: it
imports `healthsync` to read them and runs the real `./hsync` for anything that
reaches Google Health.

## Running

```sh
pnpm install
pnpm build      # writes dist/, which ./hweb serves
```

Then `./hweb` from the repository root and open the URL it prints.

For UI work, run the API and the dev server side by side:

```sh
./hweb                      # API on 8787
pnpm dev                    # UI on 5173, proxies /api to 8787
```

`pnpm typecheck` runs TypeScript without emitting.

## Shape

- `src/lib/types.ts` mirrors the server's JSON. A server change should surface
  here as a type error.
- `src/lib/api.ts` is the only place that calls `fetch`.
- `src/hooks/useHealth.ts` holds the month, day, overview and targets, and the
  single `refresh()` that a mutation calls.
- `src/hooks/useActivity.ts` holds the command log behind the footer strip.
- `src/lib/series.ts` holds the charting rules that must not drift: the
  centred seven-day mean, where a line is allowed to break, and every average's
  denominator. Pure functions, no React.
- `src/lib/scale.ts` builds one day scale that every chart in the stack shares,
  which is what makes their columns line up rather than nearly line up.
- `src/lib/icons.ts` is the only module importing the icon library.

One selected day drives the whole dashboard: clicking a chart, a calendar cell
or pressing an arrow key moves the charts, the calendar and the day panel
together.

Adding a record runs a CLI command. Editing and deleting call `/api/record`
instead, because the CLI has no command for either; the server takes the
collection lock for those and refuses anything the sync engine could not
reconcile. Nothing in the UI sends `--force`, and nothing pushes on its own.
