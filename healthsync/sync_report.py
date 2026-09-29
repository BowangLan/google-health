"""Read what ``hsync sync`` printed and hand the web app the structure behind it.

The CLI prints for a person at a terminal. The web app needs the same facts as
data: which records are coming in, which are going out, what needs attention,
and how the pull and push that followed actually went. Rather than teach the
engine a second output format, this module recognises the line shapes that
``healthsync.sync`` prints and groups them the way the engine grouped them.

Only those shapes are interpreted. Any other line is kept verbatim in the
collection's ``notes`` so nothing the CLI said is dropped. ``tests`` runs the
real engine through this parser, so a change to the CLI's wording fails a test
here before it reaches the browser.
"""

from __future__ import annotations

import re

KIND_HEAD = re.compile(r"^(food|weight):$")
CHECKING = re.compile(
    r"^(food|weight) sync · Checking Google Health \((\S+) through (\S+)\)…$"
)
SECTION = {
    "From Google Health · pull": "incoming",
    "To Google Health · push": "outgoing",
    "Needs attention": "attention",
}
SECTION_HEAD = re.compile(r"^(.+) \((\d+)\)$")
COMPARISON = re.compile(
    r"^comparison (\d+) match Google Health, (\d+) differ, "
    r"(\d+) missing remotely, (\d+) remote only$"
)
PULLED = re.compile(r"^pulled (\d+) (?:food|weight) records: (\d+) saved, (\d+) held$")
PUSHED = re.compile(
    r"^(pushed|would push) (\d+) saved, (\d+) deleted, (\d+) already absent, "
    r"(\d+) recovered, (\d+) held or failed$"
)
DELETIONS = re.compile(r"^(?:about to delete|would delete) (\d+) (?:food|weight) records:$")
DELETION_HELD = "deletion held; pass --yes to confirm without a terminal"
PULLING = "Pulling from Google Health…"
PUSHING = "Pushing to Google Health…"
# "  tag   text": two spaces, a padded tag, then the record or message.
TAGGED = re.compile(r"^  (\S+)\s+(\S.*)$")
# Field differences are indented under their row, one per line.
DIFF = re.compile(
    r"^\s{7,}(\S.*?): (.*) \((?:local|here)\) vs (.*) \((?:Google Health|remote)\)$"
)
TIMED = re.compile(r"^(\d{4}-\d{2}-\d{2}T\S+) (?:· )?(.*)$")
PATHED = re.compile(r"^(\S+\.md)(?:: | · | |; )?(.*)$")
STDERR_PREFIX = re.compile(r"^(?:hsync|fsync): ")


def collection(kind):
    return {
        "kind": kind,
        "checked": False,
        "since": None,
        "until": None,
        "incoming": [],
        "outgoing": [],
        "attention": [],
        "comparison": None,
        "ran": [],
        "pull": None,
        "push": None,
        "dry_run": False,
        "events": [],
        "deletions": [],
        "deletions_held": False,
        "notes": [],
        "error": None,
    }


def row(tag, text, phase):
    """One printed record line, with the parts a page can lay out separately."""
    item = {"tag": tag, "text": text, "phase": phase, "diff": []}
    timed = TIMED.match(text)
    pathed = PATHED.match(text)
    if timed:
        item["time"], item["detail"] = timed[1], timed[2]
    elif pathed:
        item["path"], item["detail"] = pathed[1], pathed[2]
    else:
        item["detail"] = text
    return item


def parse(stdout, stderr="", code=0, kinds=("food", "weight")):
    """Structure one run's output. ``kinds`` names the collections it covered."""
    collections = []
    current = None
    phase = "compare"
    section = None
    last = None
    listing_deletions = False

    def start(kind):
        nonlocal current, phase, section, last, listing_deletions
        current = collection(kind)
        collections.append(current)
        phase, section, last, listing_deletions = "compare", None, None, False

    if len(kinds) == 1:
        start(kinds[0])

    for raw in (stdout or "").splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue

        matched = KIND_HEAD.match(line)
        if matched:
            start(matched[1])
            continue
        if current is None:
            start(None)

        matched = CHECKING.match(line)
        if matched:
            if current["kind"] is None:
                current["kind"] = matched[1]
            current["checked"] = True
            current["since"], current["until"] = matched[2], matched[3]
            continue

        matched = DIFF.match(line)
        if matched and last is not None:
            last["diff"].append(
                {"field": matched[1], "local": matched[2], "remote": matched[3]}
            )
            continue
        last = None

        matched = SECTION_HEAD.match(line)
        if matched and matched[1] in SECTION:
            section = SECTION[matched[1]]
            continue
        if line == PULLING:
            phase, section = "pull", None
            current["ran"].append("pull")
            continue
        if line == PUSHING:
            phase, section = "push", None
            current["ran"].append("push")
            continue

        matched = COMPARISON.match(line)
        if matched:
            section = None
            current["comparison"] = dict(
                zip(("matched", "different", "missing", "remote_only"), map(int, matched.groups()))
            )
            continue
        matched = PULLED.match(line)
        if matched:
            current["pull"] = dict(zip(("fetched", "saved", "held"), map(int, matched.groups())))
            continue
        matched = PUSHED.match(line)
        if matched:
            current["dry_run"] = matched[1] == "would push"
            current["push"] = dict(
                zip(("saved", "deleted", "absent", "recovered", "failed"), map(int, matched.groups()[1:]))
            )
            listing_deletions = False
            continue
        matched = DELETIONS.match(line)
        if matched:
            listing_deletions = True
            continue
        if line == DELETION_HELD:
            current["deletions_held"] = True
            listing_deletions = False
            continue

        matched = TAGGED.match(line)
        if matched:
            last = row(matched[1], matched[2], phase)
            if phase == "compare" and section:
                current[section].append(last)
            else:
                if listing_deletions and last["tag"] == "del":
                    current["deletions"].append(last)
                current["events"].append(last)
            continue

        current["notes"].append(line.strip())

    error = None
    if stderr and stderr.strip() and (code is None or code != 0):
        error = "\n".join(
            STDERR_PREFIX.sub("", part) for part in stderr.strip().splitlines()
        )
        if current is not None:
            current["error"] = error

    seen = {item["kind"] for item in collections}
    for kind in kinds:
        if kind not in seen:
            collections.append(collection(kind))
    return {"code": code, "error": error, "collections": collections}
