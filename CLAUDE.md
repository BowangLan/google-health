# Health logging

This repo logs food and weight to Google Health using editable local files.
A request to log a record authorizes creating and syncing that record immediately.
Use the local CLI directly. `fsync` remains a food-only alias; `flog` aliases its add.

## Routine entries

```sh
./hsync food add anytime "Shake Shack Single ShackBurger, lettuce wrap" 330 -p 23 -c 3 -f 25 -u burger
./hsync weight add 175 --unit lb
```

- Food values are totals for the portion eaten; preserve the user's numbers.
- Default meal to `anytime` and amount to one when unspecified.
- For weight, pass the user's unit explicitly. If none is given and cannot be
  inferred, ask; do not guess pounds versus kilograms.
- Resolve dates in `America/Los_Angeles`. Default to today and the current time.
  Use `--date YYYY-MM-DD` and `--at HH:MM` when supplied. A past date without a
  time uses noon and automatically notes that it is a placeholder in the body.
- Sodium has a `--sodium-mg` flag. Other food macros and nutrient frontmatter
  values are grams: 480 mg sodium is `SODIUM: 0.48`.
- `add` saves the file and pushes only that record. A successful create response
  completes the task; reply with one sentence confirming the record and date.
  Extra status checks are unnecessary.
- Routine logging needs only the CLI. Read documentation or implementation
  details when a missing option or failed command requires them.

## Additional nutrients and local edits

For a nutrient without a flag:

1. Create the food with `./hsync food add ... --no-push`.
2. Edit only the resulting file, adding gram values under `nutrients`.
3. Run `./hsync food status`. If only the requested entry is pending, run
   `./hsync food push`. Push acts on every pending change in that collection,
   including deletions. If anything else is pending, stop and report what else
   would go out rather than pushing it.

Food and weight use separate directories and indexes. Use collection-specific
commands for logging. Top-level `--all` operations include both collections.
Markdown bodies are private; weight `remote_notes` is sent to Google Health.

## Recovery and conflicts

If a create may have succeeded but its ID was not saved, reconcile with the
collection's `pull` before retrying; a blind retry can duplicate the record.
Pull automatically includes older pending operations. Preserve recovery journals.

Before staging or moving logs outside a collection, run its `status` and inspect
its pending-operation journal and the selected files' IDs. Recover pending
operations before moving their files. Moving a synced file outside the collection
stages a remote deletion; explain that consequence before moving it. For temporary
copies of synced records, leave the originals in place unless removal is requested.

Push refuses conflicting edits or deletions, prints `conf`, and exits non-zero.
Do not pass `--force` to get past it; report the conflict and let the user pick
which version to keep.

For sync conflicts, recovery, setup, authorization, or tooling changes, consult
the relevant section of `README.md`. Health logs and credentials stay untracked.

Edit these instructions in `CLAUDE.md`; `AGENTS.md` is a symlink to this file.
