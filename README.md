# Google Health Sync

Log food and weight to Google Health from the command line or a local web app,
with editable Markdown files for every record.

`hsync` keeps each collection in its own directory and tracks changes between
local files and Google Health. YAML frontmatter holds the synced data; Markdown
bodies hold private notes that stay on your machine.

[Getting started](#getting-started) · [Usage](#usage) · [Web app](#web-app) ·
[Configuration](#configuration) · [Recovery](#conflicts-deletions-and-recovery) ·
[Development](#development)

## Features

- Log calories, macros, and weight; reuse foods and view daily totals.
- Browse a daily journal and intake and weight trends in the local web app.
- Pull existing records, edit them locally, and review changes before pushing.
- Detect conflicting edits and recover interrupted sync operations.
- Keep private notes alongside records, with separate food and weight storage.

## Getting started

### Prerequisites

- macOS for the setup workflow documented here.
- `uv` to run the Python entrypoints (Python 3.11+ and PyYAML are declared in the scripts).
- Git, Go, and `jq` for the Google CLI setup. The wizard can install Go through Homebrew.
- A Google account and a Google Cloud project with the Google Health API enabled;
  the wizard walks through project creation and authorization.
- Node.js and pnpm if you want the optional web app.

### Setup and authorization

From a clone of this repository, run:

```sh
./setup-wizard.sh
./auth status
```

The wizard builds Google's `ghealth` CLI, guides you through Cloud Console, and
starts login. The OAuth client must be a **Desktop app** because `ghealth` uses a
loopback redirect. Project settings are saved in `.env`; credentials live under
`~/.config/ghealth/`. `hsync` borrows and refreshes that token.

No Python environment activation is needed. Keep the `healthsync/` package
alongside the entrypoint scripts.

For an existing food-only installation, add the health metrics read and write
scopes in Cloud Console's OAuth data-access page, keep the nutrition scopes,
and authenticate again with `./auth`. `./auth login` also starts login;
`./auth scopes` lists granted scopes. Missing scopes produce authorization errors.

See the [original setup research](docs/google-health-food-logging.html) for the
OAuth publishing guidance used by the wizard, including Testing-mode token
expiry and personal-use verification limitations.

### Quick start

Pull existing records, then inspect the local collections:

```sh
./hsync pull --all --days 30
./hsync status --all
```

Log food or weight:

```sh
./hsync food add anytime "Chicken burrito" 650 -c 72 -f 24 -p 38 --note "Nutrition estimated"
./hsync weight add 175 --unit lb
```

`add` saves a Markdown file and immediately pushes **only that new record**.
Use `--no-push` to save locally, or `--dry-run` to preview the payload without
creating a file or writing remotely. The food values above are illustrative estimates.

## Usage

### Food

```sh
# Log food now (illustrative nutrition estimates for the whole portion).
./hsync food add anytime "Chicken burrito" 650 -c 72 -f 24 -p 38 --note "Nutrition estimated"

# Include sodium and a specific date and time.
./hsync food add lunch "Soup" 180 -c 20 -f 8 -p 7 --sodium-mg 480 --date 2026-09-20 --at 12:30 --note "Nutrition estimated"

# Save locally for review before syncing.
./hsync food add dinner "Steak bowl" 580 -c 50 -f 24 -p 41 --no-push --note "Nutrition estimated"

# Reuse a locally saved food at a different serving amount.
./hsync food clone "Chicken burrito" --index 1 --amount 2
./hsync food total yesterday
```

Meals are `breakfast`, `lunch`, `dinner`, `snack`, and `anytime`; use `anytime`
when the meal is unspecified. Include carbohydrate, fat, and protein for every
entry. Use supplied nutrition values when available; otherwise label estimates
with `--note`.

| Flag | Value |
| --- | --- |
| `-c`, `-f`, `-p` | Carbohydrate, fat, and protein in grams |
| `-s`, `-d` | Sugar and fibre in grams |
| `--sodium-mg` | Sodium in milligrams; stored as grams |
| `-a`, `-u` | Serving amount and unit; defaults to `1 serving` |

**Nutrition values are totals for the portion eaten.** Serving amount does not
multiply them. `clone` rescales calories and every nutrient when the amount
changes. It searches local files and offers up to ten distinct names, using the
latest entry for each. Pull a wider window to find older foods. Google may
recompute nutrition for foods that retain a catalog reference.

`./fsync COMMAND` is an alias for `./hsync food COMMAND`; `./flog ...` is shorthand
for `./fsync add ...`. Existing food files need no migration.

### Weight

```sh
./hsync weight add 79.4 --unit kg
./hsync weight add 175 --unit lb --date 2026-09-23 --at 08:00
./hsync weight add 79.4 --unit kg --note "Private context" --remote-note "Morning reading"
./hsync weight list --days 90 --unit lb
```

Pass `--unit kg` or `--unit lb` explicitly. If omitted, the CLI uses the configured
`weight_unit` (default: `kg`). Multiple measurements on the same day or within
the same minute remain separate records.

`--note` stays in the local Markdown body. `--remote-note` is sent to Google Health.

### Dates and times

Default timezone: `America/Los_Angeles`. `add` defaults to the current date and
time. Both record types accept `--date today|yesterday|YYYY-MM-DD` and `--at HH:MM`.
An earlier date without a time uses noon and records that it is a placeholder in
the private body. Dates use the timezone's correct seasonal UTC offset.
Timestamps authored by hand must include an offset; quote them in YAML.

## Web app

The optional React interface provides a daily journal, food and weight forms,
trends, and sync controls. It uses the same local records and sync engine as the CLI.

Build and launch it from the repository root:

```sh
pnpm --dir web install
pnpm --dir web build
./hweb
```

Open the printed URL (default: `http://127.0.0.1:8787`). New entries can sync
immediately; edits and deletions are local changes reviewed through the sync
dialog. See the [web app guide](web/README.md) for workflows and UI development.

## Commands

Edit a record's Markdown frontmatter, then review and send the changes:

```sh
./hsync food status
./hsync food push --dry-run
./hsync food push
```

`push` sends **all pending changes in that collection**, including deletions.
`push --dry-run` checks remote conflicts but changes neither records nor indexes.
Substitute `weight` for weight records. Both collections support:

| Command | Behavior |
| --- | --- |
| `add` | Save a file, then push only that new record |
| `pull --days N` | Fetch all pages in a date window; retain local edits and deletions |
| `status` | Show local changes, pending deletions, and recovery operations; no remote reads |
| `push --dry-run` | Preview changes and check existing records remotely; no record writes |
| `push` | Send this collection's changes; confirm file deletions before deleting remotely |
| `sync` | Compare both sides, then choose pull, push, both, or nothing |
| `sync --dry-run` | Compare without prompting or changing records, even with `--pull`/`--push` |
| `tidy` | Derive file locations from their timestamps; local only |
| `config` | Show resolved paths, timezone, and units |

Top-level shared commands require `--all`, for example `hsync sync --all` or
`hsync pull --all --days 30`. Each collection is processed separately and reported
separately. This is not a transaction across food and weight. Without a terminal,
`sync` only displays the comparison unless `--pull` and/or `--push` is supplied.
Pull runs before push when both are selected.

`sync` groups changes by direction: **From Google Health**, **To Google Health**,
and **Needs attention**. It shows field differences for edits and calls out
conflicts, missing remote records, and pending recovery. The comparison describes
the state before any actions. A clean comparison exits without a prompt.
At the prompt, use `1`/`pull`, `2`/`push`, or `3`/`both`; Enter cancels.
Invalid choices ask again. `--yes` confirms remote deletions only; it does not
choose a sync action. For a preview in a terminal, use `sync --dry-run` (or `-n`).

`--limit` is a list page size, not a total-record cap. Pagination failure aborts
the read rather than treating an incomplete result as remote deletions.

`status` reports records as **locally unchanged** when their fields match the
saved baseline; it does not contact Google. `sync` separately reports how many
records match Google Health, differ, are missing remotely, or exist only remotely.
That comparison describes the state before any selected pull/push actions.

## Configuration

Configuration is optional. Defaults are `food/` and `weight/` in this repository,
`America/Los_Angeles`, and kilograms. To customize them, copy
[`hsync.toml.example`](hsync.toml.example) to `hsync.toml` and edit it:

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

## File format

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

Before temporarily staging files outside a collection, check `status` and pending
operations. Complete recovery before moving any affected files. An unpushed file
can be moved out to exclude it from push; moving a synced file out stages its remote
deletion. Copy synced files instead when you only need a temporary backup.

### Food records

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

Food edits use **create, then delete**, because nutrition-log PATCH did not
work in the original API probes. The replacement gets a new ID. Create failure
leaves the old record intact. An incomplete replacement is journaled: a later
push finishes deletion of the old ID without creating another replacement.

Zero-valued nutrients compare the same as omitted nutrients, matching Google's
read responses. This applies to sync hashes and deletion conflict checks without
changing the numbers in your files. Unchanged legacy files remain recognizable;
pull refreshes their saved hashes, and index writes normalize known unchanged
baselines. A deleted or edited legacy record whose old hash cannot be verified
still requires conflict review; an old hash alone cannot reconstruct its values.

### Weight records

Files store `weight_kg` in kilograms. Conversion uses exactly 0.45359237 kilograms
per pound and rounds to nine decimal places to avoid floating-point sync changes.

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

## Conflicts, deletions, and recovery

### Conflicts

`pull` retains locally edited records. `pull --force` takes the remote version
and can restore a file deleted locally; the private body is preserved for existing
files. `push` checks records by ID, so changing a date cannot evade conflict
checking. A remote record that has disappeared is not silently recreated.

For conflicting edits, inspect the differing fields, then explicitly choose
`pull --force` to take remote or `push --force` to take local. A force push still
cannot edit a nonexistent remote ID; restore it or author a new record without
an ID after reviewing the deletion. Agents should report conflicts rather than
choosing a side automatically.

### Deletions

Delete a file, then `push` to delete remotely. Pending deletions survive pulls
and declined confirmation. `--yes` confirms deletion without an interactive
prompt. If the remote record changed since its last sync, deletion is refused
unless explicitly forced. Old index tombstones without a baseline digest are
also refused: restore them with `pull --force`, review, then delete again.
Unreadable files, duplicate IDs, and corrupt indexes stop sync before mutations.

`sync` reports records gone remotely and retains their local files. This permits
review and keeps private notes; remote deletion does not automatically erase them.
After deleting such a local file, push clears the already-resolved tombstone.

### Interrupted operations

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

## Privacy and backups

Food files, weight files, indexes, journals, configuration, and credentials remain
untracked. The index retains pending local deletions; journals retain incomplete
operations. Keep those files with their collection. Google can rebuild synced
frontmatter, but cannot recover private notes or entries never pushed.

## Development

The sync engine is Python; the web app uses React, TypeScript, and Vite.

| Path | Responsibility |
| --- | --- |
| [`healthsync/cli.py`](healthsync/cli.py) | Argument parsing and command dispatch |
| [`healthsync/config.py`](healthsync/config.py) | Per-collection configuration |
| [`healthsync/store.py`](healthsync/store.py) | Markdown, indexes, locks, and recovery journals |
| [`healthsync/sync.py`](healthsync/sync.py) | Conflict detection and reconciliation |
| [`healthsync/google_health.py`](healthsync/google_health.py) | OAuth and Google Health API calls |
| [`healthsync/records/`](healthsync/records/) | Food and weight schemas |
| [`healthsync/food_commands.py`](healthsync/food_commands.py) | Food logging, cloning, and totals |
| [`healthsync/web.py`](healthsync/web.py) | Local web server and API |
| [`web/`](web/) | React interface and browser tests |

### Tests

Run the Python tests with temporary files and a fake remote:

```sh
uv run --with pyyaml python -m unittest discover -s tests -v
```

Check the frontend and run its browser suite (requires Google Chrome):

```sh
pnpm --dir web typecheck
pnpm --dir web test:e2e
```

Browser tests build an isolated preview and intercept API requests with fixtures.
Neither test suite writes to live Google Health records.

For UI development, run `./hweb` and, in another terminal,
`pnpm --dir web dev`. Vite proxies API requests to port 8787.

## Documentation

- [Web app guide](web/README.md): workflows, UI architecture, and browser checks.
- [Configuration template](hsync.toml.example): available settings.
- Historical research: [food API and setup](docs/google-health-food-logging.html),
  [original fsync flows](docs/fsync-flows.html), and
  [Google CLI survey](docs/google-health-cli.html).

For all CLI options, run `./hsync --help` or a command's help, such as
`./hsync food add --help`.
