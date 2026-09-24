# Food logging

This repo logs food to Google Health. A request to log food authorizes creating
and syncing that entry immediately. Use the local CLI directly.

## Routine entry

Run `./fsync add` with the supplied nutrition values. For example:

```sh
./fsync add anytime "Shake Shack Single ShackBurger, lettuce wrap" 330 -p 23 -c 3 -f 25 -u burger
```

- Values are totals for the portion eaten; preserve the user's numbers.
- Default meal to `anytime` and amount to one when unspecified.
- Resolve dates in `America/Los_Angeles`. Default to today and the current time.
- A successful create response completes the task. Reply with one sentence
  confirming the food and date. Extra status checks are unnecessary.
- Routine logging needs only the CLI. Read documentation or implementation
  details when a missing option or failed command requires them.

## Past dates and additional nutrients

Currently `add -t HH:MM` only sets a time today (a real time of day; `25:00` is
rejected), and there is no date or sodium flag. For these requests:

1. Run `./fsync add ... --no-push` to create the entry with supported values.
2. Edit only the resulting file: set `start` to the requested date with its
   correct timezone offset, and add extra values under `nutrients`.
   Quote the timestamp — `start: '2026-09-20T12:00:00-07:00'`.
   All nutrient values are grams: 480 mg sodium is `SODIUM: 0.48`.
   For a past date without a time, use noon and note in the body that it is a
   placeholder; keep the meal `ANYTIME`.
3. Run `./fsync status`. If only the requested entry is pending, run
   `./fsync push`. There is no single-entry push: the command acts on every
   pending change, including deletions. If anything else is pending, stop and
   say what else would go out rather than pushing it.

If a create may have succeeded but its ID was not saved, reconcile with
`./fsync pull` before retrying; a blind retry can duplicate the entry.

`push` refuses an entry that changed both here and in Google Health, prints
`conf` with the differing fields, and exits non-zero. Do not pass `--force` to
get past it — report the conflict and let the user pick a side.

For sync conflicts, setup, or tooling changes, consult the relevant section of
`README.md`. Food logs and credentials stay untracked.

Edit these instructions in `CLAUDE.md`; `AGENTS.md` is a symlink to this file.
