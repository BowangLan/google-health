# Google Health on this Mac

CLI access to Google Health, aimed at logging and managing food entries.

## Run this

```sh
./setup-wizard.sh
```

Nine stages. It installs Go, builds Google's `ghealth` CLI into this folder, walks
you through the Cloud Console pages, and finishes by authenticating and reading
your food logs back. Stop with Ctrl-C any time and re-run — captured values are
kept in `.env` and offered as defaults.

## What ends up where

| Path | What |
| --- | --- |
| `setup-wizard.sh` | The guided setup |
| `flog` | Shorthand for `fsync add` |
| `fsync` | add, pull, status, push, tidy, total, config |
| `fsync.toml` | Optional config; `fsync.toml.example` is the template |
| `food/` | One Markdown file per food entry |
| `.env` | Project ID, client secret path, publishing status |
| `docs/` | Research writeups and the sync-flow diagrams |
| `google-health-cli/` | Cloned repo + built `ghealth` binary |
| `~/.config/ghealth/` | OAuth client secret and tokens (mode 0600) |

### What git tracks

Only the tooling: `fsync`, `flog`, `setup-wizard.sh`, `README.md`, `docs/`.

**Your food logs are not committed.** `food/` is health data and stays out of
the repo; Google Health holds the canonical copy and `fsync pull` rebuilds the
folder from it. Also untracked: `.env`, any `client_secret*.json`, the
`.fsync-index.json` state file, and the `google-health-cli/` clone — all of
them either secret or machine-local, and all restored by `./setup-wizard.sh`.

On a fresh clone: run the wizard, then `./fsync pull --days 7`.

## Two things that decide whether this works

**Pick "Desktop app" for the OAuth client.** `ghealth` authenticates over a
loopback port. A Web application client fails.

**Publish the app, and don't submit it for verification.** In *Testing*, refresh
tokens expire after 7 days, which kills any daily logging habit. Publishing to
*In production* removes that.

Every Google Health scope is Restricted, which normally means OAuth verification
plus a CASA third-party security assessment. You need neither: Google exempts
personal use — "apps with only yourself or a handful of known users" can skip
verification. Publish unverified and you pay two prices, both irrelevant to a
single-user setup: a "Google hasn't verified this app" screen you click through
once, and a hard cap of 100 total users.

The 7-day expiry is a property of *Testing* status, not of being unverified — so
publishing unverified gets you persistent tokens.

## The gap you're working around

The API can write food logs. The CLI can't. `nutrition-log` is registered in
`pkg/types/registry.go` with `list, get, rollup, daily-rollup, reconcile` and no
`create` — only exercise, sleep, weight, body-fat, height and oxygen-saturation
are writable.

So reads go through `ghealth` and writes go through `fsync`, which borrows
`ghealth`'s access token and calls the API itself. The wizard requests
`nutrition.writeonly` via `--scopes`, an unvalidated passthrough, so the token
can write even though the CLI won't.

## Logging a meal — `fsync add`

```sh
./fsync add lunch "Chicken burrito" 650 -c 72 -f 24 -p 38
./fsync add anytime "Egg tart" 200 -u piece
./fsync add -t 08:15 breakfast "Matcha latte" 240 -c 35 -p 6 -s 28 -u cup
./fsync add dinner "Steak bowl" 580 --no-push      # write the file, send later
./fsync add snack "Test" 10 --dry-run              # show the payload, send nothing
```

Meals: `breakfast` `lunch` `dinner` `snack` `anytime`. Options: `-c` carbs,
`-f` fat, `-p` protein, `-s` sugar, `-d` fibre, `-u` serving unit, `-a` amount,
`-t HH:MM` to backdate to earlier today, `--note` for the file body.

`add` writes the file first, then pushes it — so an entry logged this way is an
ordinary file you can edit, annotate, and re-push like any other.

`./flog …` still works; it is a shim onto `fsync add`.

## File-backed sync — `fsync`

Every food entry is one Markdown file in `food/`, with YAML frontmatter holding
the data and the body free for notes that never leave this machine.

```sh
./fsync clone "sun cake"   # copy a past entry at a new amount
./fsync sync               # diff both sides, then choose
./fsync pull --days 7      # fetch remote entries into ./food/
./fsync status             # what is new, changed, or in sync
./fsync push --dry-run     # show what would be sent
./fsync push               # create new entries, update changed ones
./fsync tidy               # file entries into their day folders
./fsync total yesterday    # calories and protein per entry, plus daily macros
./fsync config             # where every path resolved to, and why
```

### `clone` — log something you have eaten before

Search past entries by name, pick one, give the portion:

```
$ ./fsync clone "sun cake"
    1  09-22 14:36  TYT SUN CAKE     2 piece    400 kcal
    2  09-21 18:30  Sun cake         2 piece    400 kcal

  ? which? [1-2] 1
  ? amount? [2 piece] 1
  scaled ×0.5 from 2 piece
  TYT SUN CAKE  200 kcal · carbs 30 · fat 8 · protein 3 · 1 piece
   new  2026-09-23/1646--tyt-sun-cake.md
```

**The amount rescales every number**, because each one is a total for the
portion and not a per-unit rate. Half the pieces is half the calories, half the
carbs, half of every entry under `nutrients` — including the ones `fsync add`
has no flag for, like sodium and cholesterol, which is the main reason to clone
rather than retype. Press enter to keep the original portion and copy it
verbatim.

One row per distinct name, most recent first, ten at most; a food you log often
appears once, as you last logged it. The keyword is a case-insensitive substring
of the name. Matching searches every local file, so it only finds what you have
pulled — widen with `fsync pull --days N` if something older is missing.

The clone is logged at the current time with the source's meal type, and pushed
like `fsync add`. `--no-push` writes the file only, `--index N --amount X` skip
both prompts for scripts. The file body records where it came from.

An identified entry keeps its `food_ref`, so the clone still points at the same
catalog food. Google may recompute the macros from the catalog and your amount
rather than honouring the scaled numbers — a `pull` afterwards will show what it
actually stored.

### `sync` — see the difference first, then choose

`pull` and `push` each act immediately in one direction. `sync` shows you both
sides first and asks:

```
range 2026-09-21 .. 2026-09-23  (3 days, from the oldest day folder)
   *  2026-09-23/0900--venti-iced-matcha-latte--…md  edited here; push replaces it
   >  2026-09-22 Chicken Egg Sandwich  450 kcal · only in Google Health
   <  2026-09-23/new-thing.md  new here; never pushed
   !  2026-09-22/0800--ube-donut--…md  changed on BOTH sides
         kcal: 285  (here)  vs  280  (remote)
   x  2026-09-21/1953--oatmeal--…md  gone from Google Health
   -  2026-09-22/1815--egg-tart--…md  deleted here; push removes it

  1 day folder(s) to create: 2026-09-22

diff 11 to pull, 2 to push, 1 conflicted

  1  pull   11 from Google Health
  2  push   2 from here
  3  both
  n  nothing

  ? which? [1/2/3/n]
```

| | |
| --- | --- |
| `>` | only in Google Health, or changed there — `pull` brings it here |
| `<` | new here, never pushed |
| `*` | edited here; `push` replaces it (new id) |
| `!` | **both sides changed since the last sync** — neither direction is safe |
| `x` | in range, but Google Health no longer has it |
| `-` | file deleted here; `push` removes it remotely |

**The range is the oldest day folder through today**, not a `--days` count —
so it covers everything you have on disk. Folders whose names aren't
`YYYY-MM-DD` are ignored rather than fatal, so a stray folder can't silently
widen it. With no day folders at all, the range is just today.

Remote days you have no folder for are created as the entries are written;
`sync` names them before you decide.

Only `1`/`2`/`3` act. Anything else, including Ctrl-D, does nothing. `--pull`
and `--push` skip the prompt for scripts — without a terminal and without
those flags, `sync` prints the diff and stops. **Pull runs before push**, which
is deliberate: `pull` refuses to overwrite a file you have edited, so your
pending changes survive it and go out on the push.

Two things `sync` reports but will not act on. A **conflict** (`!`) is left
alone entirely — pushing loses their version, `pull --force` loses yours, so it
shows the differing fields and lets you decide. And `x` is informational:
detecting remote deletions is new to `sync`, and `status` still can't see them.

### Layout

One folder per day, one file per entry:

```
food/
  2026-09-21/
    0953--grande-iced-matcha-latte-with-oatmilk-and-pu--4238894257679590105.md
    1223--braised-pork-rice--3370798161334383301.md
  2026-09-22/
    0800--chicken-egg-sandwich--5570793513325366600.md
    1256--quinoa-and-vegetable-salad--4600245692831079784.md
  2026-09-23/
    0900--venti-iced-matcha-latte--2238625165137221493.md
```

The day folder is `YYYY-MM-DD`, the file is `HHMM--slug--id.md` (a new entry has
no id until it is pushed). **Both are derived from the entry's own `start`
field, and neither is ever read back.** Move or rename a file however you like;
`tidy` puts it back where its content says it belongs, and a date edited in the
frontmatter moves the file to the right day on the next `push` or `tidy`.

`fsync` is a single self-contained script. Its dependencies are declared inline
and `uv` fetches them on first run — nothing to install or activate.

### Moving the food folder

`food/` sits next to the script by default. To keep your entries somewhere
else — a synced folder, a notes vault, a separate private repo — copy the
template and set one key:

```sh
cp fsync.toml.example fsync.toml
```

```toml
food_dir = "~/Dropbox/health/food"
```

Three ways in, highest priority first:

```sh
./fsync pull --food-dir ~/Dropbox/health/food   # one-off
FSYNC_FOOD_DIR=~/Dropbox/health/food ./fsync pull
                                                # this shell
food_dir = "~/Dropbox/health/food"              # fsync.toml, permanent
```

The flag works in either position — `fsync --food-dir X pull` and
`fsync pull --food-dir X` are the same. `fsync config` prints what actually
resolved, which is the fastest way to check a config is being read at all:

```
config    /Users/you/google-health/fsync.toml
  food_dir  /Users/you/Dropbox/health/food                ok
  ghealth   /Users/you/google-health/…/ghealth            ok
  index     /Users/you/Dropbox/health/.fsync-index.json   ok
```

`fsync.toml` also takes `ghealth` (if you installed Google's CLI yourself
rather than letting the wizard build one here) and `index`. Paths in the file
are relative to the file; paths on the command line are relative to you.

**The index follows the food folder.** `.fsync-index.json` records which remote
ids have been seen, so a file that disappears reads as a deletion. It defaults
to sitting beside `food_dir` precisely so that pointing `--food-dir` at a new
empty folder gets a fresh index — share one index across two food folders and
every entry in the other would show up as `del`, offering to wipe them from
Google Health. Set `index` explicitly only if you know you want that.

Your config is not committed; `fsync.toml.example` is.

### The file

```yaml
---
id: '2238625165137221493'      # Google Health's id; the join key. Absent = new.
meal: BREAKFAST                 # BREAKFAST LUNCH DINNER SNACK ANYTIME
name: Venti Iced Matcha Latte
start: '2026-09-23T09:00:00-07:00'
end: '2026-09-23T09:30:00-07:00'
kcal: 320
carbs_g: 48
fat_g: 9
nutrients:
  PROTEIN: 8
  SUGAR: 35
serving:
  amount: 1
  unit: venti
food_ref: users/…/food/dataPoints/792976696   # present = editable (see below)
source: FITBIT                  # written by pull, read-only
sync:
  pulled: '2026-09-23T10:52:36-07:00'
  digest: 2888f172db1909b2      # hash at last sync; how edits are detected
---

Notes go here.
```

**Every number is a total for the portion you ate, not a per-unit rate.** That
holds for `kcal`, `carbs_g`, `fat_g` and everything under `nutrients`.
`serving` is a label describing the portion — it never scales anything:

```sh
./fsync add snack "Sun cake" 400 -a 2 -u piece   # 400 total, for both pieces
./fsync add snack "Sun cake" 200 -a 2 -u piece   # claims 200 total — wrong
```

Confirmed against the API: Google's `daily-rollup` equals a plain sum of the
`kcal` fields (3100 / 2437 / 1485 across three days here), with no multiplying
by `amount`. And an identified entry's macros match its catalog food's
reference quantity exactly — 8 cookies reading 160 kcal, not 160 per cookie.

`protein` lives under `nutrients` rather than beside `carbs_g` and `fat_g`
because that is how the API shapes it: `energy`, `totalCarbohydrate` and
`totalFat` are named top-level fields, while protein shares the generic
`nutrients` array with sodium, sugar, fibre, saturated fat and the rest.

### Creating an entry

Write a file with no `id` and push it. Only `meal`, `name`, `start` and `kcal`
are required:

```yaml
---
meal: LUNCH
name: Chicken Burrito
start: '2026-09-23T12:30:00-07:00'
kcal: 650
---
```

Drop it anywhere under `food/` — the path does not matter. `push` creates it,
writes the returned id into the frontmatter, and files it under the right day. That round-trip is what makes an entry authored by hand or by an
LLM indistinguishable from a pulled one.

### Editing an entry: it is replaced, not patched

Edit the frontmatter and push. The entry is **replaced** — a new one is
created, the old one deleted — so it comes back with a **new id**, and the
file is renamed to match:

```
  ok  2026-09-23/1558--black-sesame-soymilk--3843781039477682293.md  replaced 8889828334113072990
```

This is not a design preference. The v4 API has no working update for
`nutrition-log`:

| | PATCH result |
| --- | --- |
| Anonymous entry (no `food_ref`) | `500 INTERNAL`, even with nothing changed |
| Identified entry (has `food_ref`) | `400 Invalid argument: data_point.name` |

`updateMask` is rejected on this endpoint as an unbindable query parameter,
and Google's own CLI registers no `update` operation for the type
(`pkg/types/registry.go`, under a comment saying operations were confirmed by
probing the live API). Create and delete both work, so an edit is expressed as
both.

**The create runs first.** If it fails, nothing has changed and the original
entry is still there — deleting first would lose the entry outright when the
create then failed. If the create succeeds but the delete doesn't, you get a
warning naming the duplicate id, because nothing else will catch it: no file
claims that id any more, so it won't show up as a pending delete.

Anything referencing an entry by id — a note, a script — needs updating after
an edit. If that matters more than the edit, delete and re-add by hand instead.

### Deleting an entry

Delete the file, then push:

```sh
rm food/2026-09-23/1153--digest-check--2733503421442060062.md
./fsync push            # lists what will go, then asks
./fsync push --yes      # skip the prompt
```

`fsync` keeps an index of entries it has seen (`.fsync-index.json`), so a known
id with no file on disk reads as a deletion. Because removing a remote record
cannot be undone, `push` prints each entry it is about to delete — time, name,
calories — and waits for a `y`. With no terminal attached it refuses outright
rather than assuming consent; pass `--yes` for scripts.

Until you push, the deletion is local only. `pull` will not re-create a file you
deleted — it holds it and says so — and `pull --force` abandons the pending
deletion and restores the file from the remote copy.

### When a create loses its id

The API does not always return the new entry's id in a shape we can read. If
that happens the entry exists remotely but the file does not know its id, and
pushing again would create a duplicate. `fsync` marks the file with
`sync.created`, refuses to push it again, and saves the raw response to
`.last-create-response.json`. The next `pull` matches it on time, name and
calories, fills in the id, and the file becomes ordinary.

`status` reports these as *awaiting pull*. In practice the id parses fine — this
is a guard, not the normal path.

### Edits and conflicts

`pull` will not overwrite a file you have changed since the last sync; it skips
it and says so. `--force` overwrites. Change detection is a hash of the fields
you own, so metadata churn never reads as an edit.

## Reading the raw API

`fsync` covers day-to-day use; these are for looking behind it:

```sh
ghealth data nutrition-log list --format table
ghealth data nutrition-log daily-rollup       # daily totals, to cross-check
ghealth data nutrition-log list --raw --limit 1   # the real JSON shape
ghealth data food list                        # catalog, for editable entries
ghealth auth export | jq -r '.scopes[]'       # confirm writeonly is present
```

The payload shape in `fsync` was taken from a real response, not the docs:
Google's nutrition guide shows `interval` while the RPC reference shows
`sample_time`. `interval` is correct. `mealType` also has a fifth value the docs
omit, `ANYTIME`, which is what most app-logged entries use.

## Worth knowing

- Writing food needs no Fitbit or Pixel Watch. It's your account's data store.
- Nothing is editable in place: `PATCH` fails for both anonymous and identified
  entries, so `fsync` expresses an edit as create-then-delete (above). Deletes
  go through `:batchDelete` — there is no HTTP DELETE.
- `nutrition-log` only needs `"create"` added to its `Operations` list upstream;
  the generic `data … create --json` path already exists. Small PR if you want it.

Research writeup: [`docs/google-health-food-logging.html`](docs/google-health-food-logging.html)
Sync flows: [`docs/fsync-flows.html`](docs/fsync-flows.html)
CLI survey: [`docs/google-health-cli.html`](docs/google-health-cli.html)
