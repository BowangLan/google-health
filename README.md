# Google Health on this Mac

`hsync` synchronizes food and weight records between Google Health and editable
Markdown files. Each collection has its own directory, index, and pending changes.
The Markdown body is private; only supported frontmatter fields are sent remotely.

```sh
./hsync food add lunch "Chicken burrito" 650 -c 72 -f 24 -p 38
./hsync weight add 175 --unit lb
./hsync weight pull --days 90
./hsync weight list --days 30 --unit lb
./hsync weight sync
./hsync status --all
```

`./fsync COMMAND` remains an alias for `./hsync food COMMAND`.
`./flog ...` remains shorthand for `./fsync add ...`. Existing food files and
change-detection hashes remain compatible. No food directory migration is needed.

## Setup and authorization

Run `./setup-wizard.sh` on a fresh clone. It builds Google's `ghealth` CLI,
walks through Cloud Console setup, and authenticates. Both entrypoints use `uv`
to run Python with the declared PyYAML dependency; no environment activation is
needed. Keep the `healthsync/` package alongside the scripts.

The OAuth client must be a **Desktop app**. `ghealth` uses a loopback redirect;
a Web application client will not work. The wizard retains project settings
in `.env`, and `ghealth` keeps its credentials under `~/.config/ghealth/`.

For an existing food-only installation, add the health metrics scopes in
Cloud Console's OAuth data-access page, then authenticate again:

```sh
./auth
```

Check authentication with `./auth status`, or list granted scopes with
`./auth scopes` (requires `jq`). `./auth` and `./auth login` both start login.

The health metrics scopes cover weight. Keeping nutrition scopes in the request
preserves food access. `hsync` borrows and refreshes `ghealth`'s token. A missing
scope produces an authorization error; it does not silently enable access.

The original setup guidance recommends publishing a personal OAuth app as
unverified rather than leaving it in Testing, where refresh tokens expire after
seven days. See the [original setup research](docs/google-health-food-logging.html)
for the personal-use verification exemption and its limitations.

## Commands

Both `food` and `weight` support:

| Command | Behavior |
| --- | --- |
| `add` | Save a file, then push only that new record |
| `pull --days N` | Fetch all pages in a date window; retain local edits and deletions |
| `status` | Show local changes, pending deletions, and recovery operations; no remote reads |
| `push --dry-run` | Preview changes and check existing records remotely; no record writes |
| `push` | Send this collection's changes; confirm file deletions before deleting remotely |
| `sync` | Compare both sides, then choose pull, push, both, or nothing |
| `tidy` | Derive file locations from their timestamps; local only |
| `config` | Show resolved paths, timezone, and units |

Top-level shared commands require `--all`, for example `hsync sync --all` or
`hsync pull --all --days 30`. Each collection is processed separately and reported
separately. This is not a transaction across food and weight. Without a terminal,
`sync` only displays the comparison unless `--pull` and/or `--push` is supplied.
Pull runs before push when both are selected.

`--limit` is a list page size, not a total-record cap. Pagination failure aborts
the read rather than treating an incomplete result as remote deletions.

## Food

```sh
./fsync add anytime "Egg tart" 200 -u piece
./fsync add breakfast "Matcha latte" 240 -c 35 -p 6 -s 28 -t 08:15
./hsync food add anytime "Soup" 180 --sodium-mg 480 --date 2026-09-20
./hsync food add dinner "Steak bowl" 580 --no-push
./hsync food add snack "Test" 10 --dry-run
./hsync food clone "sun cake" --index 1 --amount 2
./hsync food total yesterday
```

Meals are `breakfast`, `lunch`, `dinner`, `snack`, and `anytime`.
`-c`, `-f`, `-p`, `-s`, and `-d` set carbohydrate, fat, protein, sugar,
and fibre in grams. `--sodium-mg` accepts milligrams and converts them to grams
in the file. `-a` and `-u` describe the serving amount and unit.

**All nutrition values are totals for the portion eaten.** Serving amount does
not multiply them. `clone` explicitly rescales calories, macros, and every
nutrient when its amount changes. It searches local files, keeps the latest
entry per distinct name, and offers up to ten matches. Pull a wider window to
find older foods. Identified foods retain their catalog reference; Google may
recompute their nutrition from that reference and the serving amount.

```yaml
---
id: 'example-id'
meal: LUNCH
name: Chicken burrito
start: '2026-09-24T12:30:00-07:00'
end: '2026-09-24T12:31:00-07:00'
kcal: 650
carbs_g: 72
fat_g: 24
nutrients:
  PROTEIN: 38
  SODIUM: 0.48
serving:
  amount: 1
  unit: burrito
sync:
  pulled: '2026-09-24T13:00:00-07:00'
  digest: example
---

Private notes.
```

A manually authored food requires `meal`, `name`, `start`, and `kcal`.
Omit `id` for a new record. Optional `food_ref` preserves a Google catalog
reference. `source` is read-only metadata. A missing end time becomes one minute
after start when validated for a write.

Food edits still use **create, then delete**, because nutrition-log PATCH did not
work in the original API probes. The replacement gets a new ID. Create failure
leaves the old record intact. An incomplete replacement is now journaled: a later
push finishes deletion of the old ID without creating another replacement.

Zero-valued nutrients compare the same as omitted nutrients, matching Google's
read responses. This applies to sync hashes and deletion conflict checks without
changing the numbers in your files. Unchanged legacy files remain recognizable;
pull refreshes their saved hashes, and index writes normalize known unchanged
baselines. A deleted or edited legacy record whose old hash cannot be verified
still requires conflict review; an old hash alone cannot reconstruct its values.

## Weight

```sh
./hsync weight add 79.4 --unit kg
./hsync weight add 175 --unit lb --date 2026-09-23 --at 08:00
./hsync weight add 79.4 --note "Private context" --remote-note "Morning reading"
./hsync weight add 79.4 --no-push
./hsync weight list --days 90 --unit lb
```

Files store kilograms in `weight_kg`; `--unit` and `weight_unit` control entry and
display. Pound conversion uses exactly 0.45359237 kilograms per pound. Conversion
is normalized to nine decimal places in kilograms so repeated pull/push cycles
do not produce floating-point edits. Multiple measurements per day, including
within the same minute, remain separate records.

```yaml
---
id: 'example-id'
time: '2026-09-24T08:00:00-07:00'
weight_kg: 79.4
remote_notes: Morning reading
sync:
  pulled: '2026-09-24T09:00:00-07:00'
  digest: example
---

Private context stays on this machine.
```

A new weight record requires `time` and `weight_kg`, with no `id`. Google stores
an instantaneous `sampleTime`, a `weightGrams` number, and optional `notes`.
`remote_notes` maps to those notes; the body remains private.
[Google's weight schema](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints#Weight)

Weight edits use PATCH and retain their ID, matching the installed Google CLI's
weight update operation. A failed PATCH does not fall back to replacement.
The request format follows Google's
[update reference](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/patch).

## Dates and files

Default timezone: `America/Los_Angeles`. `add` defaults to the current date and
time. Both record types accept `--date today|yesterday|YYYY-MM-DD` and `--at HH:MM`.
An earlier date without a time uses noon and records that it is a placeholder in
the private body. Dates use the timezone's correct seasonal UTC offset.
Timestamps authored by hand must include an offset; quote them in YAML.

```text
food/
  .fsync-index.json
  .food-operations.json       # created when needed
  2026-09-24/1230--chicken-burrito--<id>.md
weight/
  .hsync-index.json
  .weight-operations.json     # created when needed
  2026-09-24/0800--weight--<id>.md
```

Paths are decorative; fields inside the files determine their identity and date.
Move or rename a record anywhere inside its collection, then run `tidy` to restore
its normal location. New same-minute records receive a filename suffix until
Google assigns an ID. The two collections must use separate, non-nested folders.

## Configuration

Copy `hsync.toml.example` to `hsync.toml`:

```toml
food_dir = "~/Dropbox/health/food"
weight_dir = "~/Dropbox/health/weight"
timezone = "America/Los_Angeles"
weight_unit = "kg"
```

Configuration discovery checks the repository's `hsync.toml`, then `fsync.toml`,
then `~/.config/hsync/config.toml`, then `~/.config/fsync/config.toml`.
The first existing file is used. `--config`, `HSYNC_CONFIG`, or legacy
`FSYNC_CONFIG` can name a specific file.

`status` reports records as **locally unchanged** when their fields match the
saved baseline; it does not contact Google. `sync` separately reports how many
records match Google Health, differ, are missing remotely, or exist only remotely.
That comparison describes the state before any selected pull/push actions.

Directory precedence is command-line flag, `HSYNC_FOOD_DIR`/`HSYNC_WEIGHT_DIR`,
legacy `FSYNC_FOOD_DIR` for food, configuration, then defaults. Common flags work
before or after the record type or command. Paths in configuration are relative
to that file; command-line paths are relative to the current directory.

`ghealth` sets the binary path; `GHEALTH` overrides it. Index defaults are inside
each collection. Optional `food_index` and `weight_index` override them; legacy
`index` applies only to food. Never share an index between collections or point
an existing index at an unrelated empty directory: missing files represent
pending remote deletions. Indexes record their collection and directory to
catch accidental reuse. To move a collection, move its entire folder with the
index and recovery journal, then change its configured directory.

Local commands lock the collection to prevent simultaneous `hsync` and `fsync`
processes from issuing duplicate writes. Locks coordinate processes on this Mac;
they do not coordinate separate Macs through a cloud-synced folder.

## Conflicts, deletions, and recovery

`pull` retains locally edited records. `pull --force` takes the remote version
and can restore a file deleted locally; the private body is preserved for existing
files. `push` checks records by ID, so changing a date cannot evade conflict
checking. A remote record that has disappeared is not silently recreated.

For conflicting edits, inspect the differing fields, then explicitly choose
`pull --force` to take remote or `push --force` to take local. A force push still
cannot edit a nonexistent remote ID; restore it or author a new record without
an ID after reviewing the deletion. Agents should report conflicts rather than
choosing a side automatically.

Delete a file, then `push` to delete remotely. Pending deletions survive pulls
and declined confirmation. `--yes` confirms deletion without an interactive
prompt. If the remote record changed since its last sync, deletion is refused
unless explicitly forced. Old index tombstones without a baseline digest are
also refused: restore them with `pull --force`, review, then delete again.
Unreadable files, duplicate IDs, and corrupt indexes stop sync before mutations.

`sync` reports records gone remotely and retains their local files. This permits
review and keeps private notes; remote deletion does not automatically erase them.
After deleting such a local file, push clears the already-resolved tombstone.

Every create, edit, and replacement is journaled before the remote call. If a
create may have succeeded but no ID was saved, **run `pull` before retrying**.
Recovery requires a unique match on both sides and holds ambiguous matches. Pull
automatically widens its date range to include pending journal entries and legacy
unacknowledged creates, and prints the adjusted start date. Ordinary old files do
not widen a pull. Never clear recovery state merely to retry a
create: that can duplicate a remote record.

Keep pending-operation files in place until recovery completes. Bulk push pauses
while unresolved operations remain; a newly requested `add` still targets only
its own record.

Pull, push, and sync check that pending-operation files are present before any
remote calls. If one was moved outside the collection or renamed before receiving
an ID, move it back to the printed path (or restore it from backup) and run pull.
Keep the journal intact. An acknowledged record can still be recovered after a
rename within the collection because its saved ID identifies it.

An incomplete food replacement keeps the new record and old ID in its journal.
Pull can recover the new ID; push retries only the old-ID cleanup, checking first
that the old record has not changed. Pending/uncertain weight updates reconcile
when a read matches the submitted values. If no unique outcome can be confirmed,
the command stays held and requires manual review of the journal and remote data.

`add --dry-run` only prints the payload. It creates no file. `push --dry-run`
reads remote records for conflict checks, but changes neither records nor indexes.

## Privacy and development

Food files, weight files, indexes, journals, configuration, and credentials remain
untracked. The index retains pending local deletions; journals retain incomplete
operations. Keep those files with their collection. Google can rebuild synced
frontmatter, but cannot recover private notes or entries never pushed.

Implementation:

- `healthsync/cli.py`: parsing and command dispatch.
- `healthsync/config.py`: independent collection configuration.
- `healthsync/store.py`: Markdown, indexes, locks, and journals.
- `healthsync/sync.py`: shared conflict and reconciliation policy.
- `healthsync/google_health.py`: OAuth, paginated reads, and REST mutations.
- `healthsync/records/`: food and weight schemas and transformations.
- `healthsync/food_commands.py`: food entry, cloning, and daily totals.

Run the isolated tests; they use temporary files and a fake remote, never live
health writes:

```sh
uv run --with pyyaml python -m unittest discover -s tests -v
```

Historical references: [food API research](docs/google-health-food-logging.html),
[original fsync flows](docs/fsync-flows.html),
[Google CLI survey](docs/google-health-cli.html).
