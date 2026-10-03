"""Local web interface for logging food and weight.

Reads and writes are deliberately split. Reading imports the ``healthsync``
package and scans the collection directly, so a page can show records rather
than captured terminal text. Writing never does: every change is handed to the
real ``./hsync`` process, which keeps locking, journalling, recovery, and
conflict policy in the one place that already implements them.

:data:`SPEC` describes every command, option, and positional argument that
``healthsync.cli`` accepts. It is the validation layer for the write path: a
request is translated into an argument list only if the spec describes it, so
the browser cannot reach a command or flag the CLI does not have. The pages
above it are organised around food and weight, not around that table.

The CLI runs without a terminal attached, so its interactive prompts (clone
selection, sync direction, remote deletion) take their documented
non-interactive path. That is why the interface supplies the explicit flags
that stand in for those prompts.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shlex
import subprocess
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from healthsync import burned, sync_report
from healthsync.common import Clock, number, tidy_numbers
from healthsync.config import resolve
from healthsync.records.food import Food
from healthsync.records.weight import POUND_KG, Weight
from healthsync.store import Store, read_entry, write_entry

ROOT = Path(__file__).resolve().parent.parent
# The built React app. `pnpm build` in web/ produces it; during development
# `pnpm dev` serves the UI itself and proxies /api back here.
STATIC = ROOT / "web" / "dist"
TIMEOUT = 180

MEALS = ("breakfast", "lunch", "dinner", "snack", "anytime")
MEAL_ORDER = {"BREAKFAST": 0, "LUNCH": 1, "DINNER": 2, "SNACK": 3, "ANYTIME": 4}


def field(name, flag, kind, label, **extra):
    """One form control and the argument it produces."""
    return {"name": name, "flag": flag, "kind": kind, "label": label, **extra}


# Options accepted before or after any command, on every collection.
PATHS = [
    field("config", "--config", "text", "Config file", hint="overrides discovery"),
    field("data_dir", "--data-dir", "text", "Data directory"),
]

LIMIT = field("limit", "--limit", "int", "Page size", default=500,
              hint="remote list page size, not a record cap")


def shared(name):
    """Fields for the commands that food, weight, and --all all share."""
    if name == "pull":
        return [
            field("days", "--days", "int", "Days", default=7,
                  hint="window ending today; widened automatically for recovery"),
            LIMIT,
            field("force", "--force", "bool", "Force",
                  hint="discard local edits and restore local deletions"),
        ]
    if name == "push":
        return [
            field("dry_run", "-n", "bool", "Dry run",
                  hint="check remotely, write nothing"),
            field("yes", "-y", "bool", "Confirm deletions",
                  hint="required to delete remotely without a terminal"),
            field("force", "--force", "bool", "Force",
                  hint="choose local over remote on a conflict"),
            LIMIT,
        ]
    if name == "sync":
        return [
            field("pull", "--pull", "bool", "Then pull"),
            field("push", "--push", "bool", "Then push"),
            field("yes", "-y", "bool", "Confirm deletions"),
            LIMIT,
        ]
    return []


SHARED = {
    "pull": "Fetch Google Health records into files, keeping local edits.",
    "push": "Send this collection's changes to Google Health.",
    "status": "Show local changes and pending operations. No remote reads.",
    "sync": "Compare both sides, then optionally pull and/or push.",
    "tidy": "Move files to the locations their timestamps imply. Local only.",
    "config": "Show the resolved paths, timezone, and units.",
}

FOOD_ADD = [
    field("meal", None, "choice", "Meal", options=list(MEALS), default="anytime",
          required=True),
    field("name", None, "text", "Name", required=True, placeholder="Chicken burrito"),
    field("kcal", None, "number", "Calories", required=True, suffix="kcal"),
    field("carbs", "-c", "number", "Carbohydrate", suffix="g"),
    field("fat", "-f", "number", "Fat", suffix="g"),
    field("protein", "-p", "number", "Protein", suffix="g"),
    field("sugar", "-s", "number", "Sugar", suffix="g"),
    field("fiber", "-d", "number", "Fibre", suffix="g"),
    field("sodium_mg", "--sodium-mg", "number", "Sodium", suffix="mg"),
    field("amount", "-a", "number", "Serving amount", default=1),
    field("unit", "-u", "text", "Serving unit", default="serving"),
    field("date", "--date", "text", "Date", placeholder="today | yesterday | 2026-09-24"),
    field("at", "-t", "text", "Time", placeholder="HH:MM"),
    field("note", "--note", "text", "Private note", multiline=True),
    field("no_push", "--no-push", "bool", "Save locally only"),
    field("dry_run", "-n", "bool", "Dry run", hint="print the payload, write no file"),
]

WEIGHT_ADD = [
    field("value", None, "number", "Weight", required=True),
    field("unit", "-u", "choice", "Unit", options=["", "kg", "lb"],
          labels={"": "configured default"}),
    field("remote_note", "--remote-note", "text", "Note sent to Google Health"),
    field("date", "--date", "text", "Date", placeholder="today | yesterday | 2026-09-24"),
    field("at", "-t", "text", "Time", placeholder="HH:MM"),
    field("note", "--note", "text", "Private note", multiline=True),
    field("no_push", "--no-push", "bool", "Save locally only"),
    field("dry_run", "-n", "bool", "Dry run"),
]


def collection(kind):
    commands = {
        name: {"summary": summary, "fields": shared(name)}
        for name, summary in SHARED.items()
    }
    if kind == "food":
        commands["add"] = {
            "summary": "Save a food file, then push only that record.",
            "note": "Nutrition values are totals for the portion eaten. The "
                    "serving amount does not multiply them.",
            "fields": FOOD_ADD,
        }
        commands["clone"] = {
            "summary": "Copy a past food at a new amount, rescaling its nutrition.",
            "note": "Without an index the run only lists matches, because the "
                    "browser cannot answer the CLI's prompt.",
            "fields": [
                field("keyword", None, "text", "Search local names", required=True),
                field("index", "--index", "int", "Match number",
                      hint="from a previous listing run"),
                field("amount", "--amount", "number", "New amount"),
                field("no_push", "--no-push", "bool", "Save locally only"),
                field("dry_run", "-n", "bool", "Dry run"),
            ],
        }
        commands["total"] = {
            "summary": "Daily calories and macros from local files.",
            "fields": [field("date", None, "text", "Date", default="today",
                             placeholder="today | yesterday | 2026-09-24")],
        }
    else:
        commands["add"] = {
            "summary": "Save a weight file, then push only that record.",
            "fields": WEIGHT_ADD,
        }
        commands["list"] = {
            "summary": "Show local measurements.",
            "fields": [
                field("days", "--days", "int", "Days", default=30),
                field("unit", "--unit", "choice", "Unit", options=["", "kg", "lb"],
                      labels={"": "configured default"}),
            ],
        }
    return commands


# Command order as presented in the sidebar; entry commands lead.
ORDER = {
    "food": ["add", "clone", "total", "status", "sync", "pull", "push", "tidy", "config"],
    "weight": ["add", "list", "status", "sync", "pull", "push", "tidy", "config"],
    "all": ["status", "sync", "pull", "push", "tidy", "config"],
}

SPEC = {
    "paths": PATHS,
    "collections": {
        "food": {
            "label": "Food",
            "order": ORDER["food"],
            "commands": collection("food"),
        },
        "weight": {
            "label": "Weight",
            "order": ORDER["weight"],
            "commands": collection("weight"),
        },
        "all": {
            "label": "Both",
            "order": ORDER["all"],
            "note": "Each collection is processed and reported separately. "
                    "This is not one transaction across both.",
            "commands": {
                name: {"summary": SHARED[name], "fields": shared(name)}
                for name in ORDER["all"]
            },
        },
    },
}


class Invalid(ValueError):
    """A request that the spec does not describe."""


def scalar(spec, raw):
    """Validate one submitted value against its field description."""
    kind = spec["kind"]
    if kind == "bool":
        return bool(raw)
    text = "" if raw is None else str(raw).strip()
    if not text:
        if spec.get("required"):
            raise Invalid(f"{spec['label']} is required")
        return None
    if kind == "int":
        try:
            value = int(text)
        except ValueError:
            raise Invalid(f"{spec['label']} must be a whole number") from None
        if value < 1:
            raise Invalid(f"{spec['label']} must be greater than zero")
        return str(value)
    if kind == "number":
        try:
            float(text)
        except ValueError:
            raise Invalid(f"{spec['label']} must be a number") from None
        return text
    if kind == "choice" and text not in spec["options"]:
        raise Invalid(f"{spec['label']} does not accept {text!r}")
    if spec["flag"] is None and text.startswith("-"):
        # A positional beginning with a dash would be read as an option.
        raise Invalid(f"{spec['label']} cannot begin with a dash")
    return text


def argv(payload):
    """Turn a submitted selection into the exact argument list to run."""
    kind = payload.get("collection")
    entry = SPEC["collections"].get(kind)
    if entry is None:
        raise Invalid("unknown collection")
    command = payload.get("command")
    if command not in entry["commands"]:
        raise Invalid(f"unknown command {command!r}")
    values = payload.get("values") or {}
    if not isinstance(values, dict):
        raise Invalid("values must be an object")

    head = []
    for spec in PATHS:
        value = scalar(spec, values.get(spec["name"]))
        if value is not None:
            head += [spec["flag"], value]

    positional, options = [], []
    for spec in entry["commands"][command]["fields"]:
        value = scalar(spec, values.get(spec["name"]))
        if spec["kind"] == "bool":
            if value:
                options.append(spec["flag"])
        elif value is None:
            continue
        elif spec["flag"] is None:
            positional.append(value)
        else:
            options += [spec["flag"], value]

    if kind == "all":
        return head + [command, "--all"] + options
    return head + [kind, command] + positional + options


def run(arguments):
    """Run the CLI without a terminal, so its prompts take the written path."""
    environment = dict(os.environ, NO_COLOR="1", PYTHONUNBUFFERED="1")
    command = [str(ROOT / "hsync"), *arguments]
    # The CLI takes each collection's lock non-blockingly for the whole run.
    # Serialising runs here means a sync in progress delays a new entry by a
    # few seconds instead of failing it with a lock error.
    with CLI_LOCK:
        try:
            done = subprocess.run(
                command,
                cwd=ROOT,
                env=environment,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                timeout=TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return {"code": None, "stdout": "", "stderr": f"no response after {TIMEOUT}s"}
    return {"code": done.returncode, "stdout": done.stdout, "stderr": done.stderr}


def preview(arguments):
    return "./hsync " + " ".join(shlex.quote(part) for part in arguments)


# Syncing ------------------------------------------------------------------
#
# The web app syncs through the real `sync` command. The CLI does the
# comparing, pulling, pushing, and conflict checking; the response carries its
# output both raw and structured, plus a fresh local overview so the page can
# update without a second round trip.


def sync_run(payload):
    """Run `hsync sync` for one or both collections and structure its report."""
    kind = payload.get("collection") or "all"
    values = {"limit": "500"}
    for key in ("pull", "push", "yes"):
        if payload.get(key):
            values[key] = True
    arguments = argv({"collection": kind, "command": "sync", "values": values})
    result = run(arguments)
    result["command"] = preview(arguments)
    kinds = ("food", "weight") if kind == "all" else (kind,)
    result.update(
        sync_report.parse(result["stdout"], result["stderr"], result["code"], kinds)
    )
    if payload.get("pull"):
        # Calories burned are read-only, so they refresh with every pull. A
        # failure here (such as a missing scope) is reported but leaves the
        # food and weight result alone.
        refreshed = run(["cal", "pull", "--days", "7"])
        result["burned"] = {"code": refreshed["code"], "stderr": refreshed["stderr"]}
    result["overview"] = overview()
    return result


# Reading ------------------------------------------------------------------
#
# These helpers scan the collection through the same package the CLI uses, so
# the pages agree with `hsync status` without parsing its printed output. They
# only read; every mutation goes through run() below.


def context(kind):
    """Resolve one collection the way the CLI resolves it."""
    config = resolve(argparse.Namespace(), kind)
    record = Food() if kind == "food" else Weight()
    return config, Store(config, record), record


def entries(store, record):
    """Every local record with the state the CLI would report for it."""
    by_id, new, orphans, broken = store.scan()
    rows = []
    for state, items in (
        ("synced", list(by_id.values())),
        ("new", new),
        ("awaiting pull", orphans),
    ):
        for path, fm, body in items:
            if state == "synced" and record.dirty(fm):
                state = "edited"
            rows.append((state, path, fm, body))
            state = "synced" if state == "edited" else state
    return rows, broken


def food_row(state, store, path, fm, body):
    nutrients = {k.upper(): v for k, v in (fm.get("nutrients") or {}).items()}
    serving = fm.get("serving") or {}
    return {
        "state": state,
        "id": fm.get("id"),
        "path": store.rel(path),
        "time": record_time(fm, "start"),
        "day": Food().day(fm),
        "meal": str(fm.get("meal", "ANYTIME")),
        "name": str(fm.get("name", "")),
        "kcal": tidy_numbers(fm.get("kcal") or 0),
        "carbs": tidy_numbers(fm.get("carbs_g")),
        "fat": tidy_numbers(fm.get("fat_g")),
        "protein": tidy_numbers(nutrients.get("PROTEIN")),
        "sugar": tidy_numbers(nutrients.get("SUGAR")),
        "fiber": tidy_numbers(nutrients.get("DIETARY_FIBER")),
        "sodium_mg": tidy_numbers(
            nutrients["SODIUM"] * 1000 if nutrients.get("SODIUM") is not None else None
        ),
        "amount": tidy_numbers((serving or {}).get("amount", 1)),
        "unit": str((serving or {}).get("unit", "serving")),
        "identified": bool(fm.get("food_ref")),
        "note": body.strip(),
    }


def weight_row(state, store, path, fm, body, unit):
    kilograms = float(fm["weight_kg"])
    return {
        "state": state,
        "id": fm.get("id"),
        "path": store.rel(path),
        "time": record_time(fm, "time"),
        "day": Weight().day(fm),
        "kg": tidy_numbers(kilograms),
        "value": round(kilograms / POUND_KG, 2) if unit == "lb" else tidy_numbers(kilograms),
        "unit": unit,
        "remote_note": fm.get("remote_notes") or "",
        "note": body.strip(),
    }


def record_time(fm, field):
    return str(fm.get(field, ""))[:16]


def day_view(date_text=None):
    """Everything one day needs: its entries, its totals, and its weight."""
    config, store, record = context("food")
    clock = Clock(config.timezone)
    today = clock.today().isoformat()
    day = clock.date(date_text).isoformat() if date_text else today

    rows, broken = entries(store, record)
    food = [
        food_row(state, store, path, fm, body)
        for state, path, fm, body in rows
        if record.day(fm) == day
    ]
    food.sort(key=lambda row: (row["time"], MEAL_ORDER.get(row["meal"], 9)))

    totals = {key: 0 for key in ("kcal", "carbs", "fat", "protein", "sugar", "fiber")}
    for row in food:
        for key in totals:
            totals[key] += float(row[key] or 0)
    totals = {key: tidy_numbers(round(value, 3)) for key, value in totals.items()}

    weight_config, weight_store, weight_record = context("weight")
    weight_rows, weight_broken = entries(weight_store, weight_record)
    unit = display_unit(weight_config)
    weights = [
        weight_row(state, weight_store, path, fm, body, unit)
        for state, path, fm, body in weight_rows
        if weight_record.day(fm) == day
    ]
    weights.sort(key=lambda row: row["time"])

    # The most recent earlier weigh-in day, for the day-to-day change. Like the
    # charts, it takes that day's first reading: morning weigh-ins compare with
    # each other, and an evening one is a different measurement.
    earlier = [
        weight_row(state, weight_store, path, fm, body, unit)
        for state, path, fm, body in weight_rows
        if weight_record.day(fm) < day
    ]
    previous = None
    if earlier:
        last_day = max(row["day"] for row in earlier)
        first = min((row for row in earlier if row["day"] == last_day), key=lambda row: row["time"])
        previous = {"day": first["day"], "time": first["time"], "value": first["value"]}

    return {
        "day": day,
        "today": today,
        "timezone": config.timezone,
        "weight_unit": unit,
        "food": food,
        "totals": totals,
        "weights": weights,
        "previous_weight": previous,
        "burned": burned.load(config).get(day),
        "broken": [f"{store.rel(p)}: {e}" for p, e in broken]
        + [f"{weight_store.rel(p)}: {e}" for p, e in weight_broken],
    }


def weight_view(days=90, unit=None):
    config, store, record = context("weight")
    unit = display_unit(config, unit)
    clock = Clock(config.timezone)
    since = (clock.today() - dt.timedelta(days=days - 1)).isoformat()
    rows, broken = entries(store, record)
    points = [
        weight_row(state, store, path, fm, body, unit)
        for state, path, fm, body in rows
        if record.day(fm) >= since
    ]
    points.sort(key=lambda row: row["time"])
    return {
        "unit": unit,
        "days": days,
        "since": since,
        "points": points,
        "broken": [f"{store.rel(p)}: {e}" for p, e in broken],
    }


def month_view(month_text=None):
    """Per-day figures for a calendar grid: one scan, bucketed by day.

    The grid needs the days either side of the month too, so a cell that is
    visible in the leading or trailing week is never blank for lack of data.
    """
    config, store, record = context("food")
    clock = Clock(config.timezone)
    today = clock.today()
    if month_text:
        year, _, mon = month_text.partition("-")
        first = dt.date(int(year), int(mon), 1)
    else:
        first = today.replace(day=1)
    last = (first + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)
    # Six weeks from the Sunday on or before the first, which covers any month.
    grid_start = first - dt.timedelta(days=(first.weekday() + 1) % 7)
    grid_end = grid_start + dt.timedelta(days=41)

    days = {}

    def bucket(day):
        return days.setdefault(day, {
            "day": day, "kcal": 0, "protein": 0, "carbs": 0, "fat": 0,
            "entries": 0, "weight": None, "weight_count": 0,
            "states": {}, "worst": None,
        })

    def mark(cell, state):
        if state == "synced":
            return
        cell["states"][state] = cell["states"].get(state, 0) + 1
        # A cell shows one dot: the state that most needs attention wins.
        rank = {"new": 1, "edited": 1, "awaiting pull": 2}
        if cell["worst"] is None or rank.get(state, 2) > rank.get(cell["worst"], 2):
            cell["worst"] = state

    food_rows, food_broken = entries(store, record)
    for state, path, fm, body in food_rows:
        day = record.day(fm)
        if not (grid_start.isoformat() <= day <= grid_end.isoformat()):
            continue
        cell = bucket(day)
        cell["entries"] += 1
        cell["kcal"] += float(fm.get("kcal") or 0)
        cell["carbs"] += float(fm.get("carbs_g") or 0)
        cell["fat"] += float(fm.get("fat_g") or 0)
        nutrients = {k.upper(): v for k, v in (fm.get("nutrients") or {}).items()}
        cell["protein"] += float(nutrients.get("PROTEIN") or 0)
        mark(cell, state)

    weight_config, weight_store, weight_record = context("weight")
    weight_rows, weight_broken = entries(weight_store, weight_record)
    unit = display_unit(weight_config)
    for state, path, fm, body in weight_rows:
        day = weight_record.day(fm)
        if not (grid_start.isoformat() <= day <= grid_end.isoformat()):
            continue
        cell = bucket(day)
        cell["weight_count"] += 1
        kilograms = float(fm["weight_kg"])
        # Several readings in a day: the cell shows the first of them.
        if cell["weight"] is None or fm["time"] < cell["weight"]["time"]:
            cell["weight"] = {
                "time": str(fm["time"]),
                "value": round(kilograms / POUND_KG, 1) if unit == "lb" else round(kilograms, 1),
            }
        mark(cell, state)

    for cell in days.values():
        for key in ("kcal", "protein", "carbs", "fat"):
            cell[key] = tidy_numbers(round(cell[key], 1))

    # Weight change against the previous day that has a reading, so the arrow in
    # a cell compares like with like across a gap of unweighed days.
    previous = None
    for day in sorted(days):
        reading = days[day]["weight"]
        if reading is None:
            continue
        reading["delta"] = (
            round(reading["value"] - previous, 1) if previous is not None else None
        )
        previous = reading["value"]

    return {
        "month": first.strftime("%Y-%m"),
        "label": first.strftime("%B %Y"),
        "today": today.isoformat(),
        "first": first.isoformat(),
        "last": last.isoformat(),
        "grid_start": grid_start.isoformat(),
        "grid_end": grid_end.isoformat(),
        "weight_unit": unit,
        "timezone": config.timezone,
        "days": days,
        "broken": [f"{store.rel(p)}: {e}" for p, e in food_broken]
        + [f"{weight_store.rel(p)}: {e}" for p, e in weight_broken],
    }


def series_view(days=180, unit=None):
    """A dense daily series for charting.

    Every calendar day in the range is present, and a day with nothing logged
    carries null rather than zero: a chart must distinguish "ate nothing
    recorded" from "ate zero", and must not draw a line across a week with no
    weigh-ins. Runs of missing weight days are reported so the client does not
    have to decide what counts as a gap.
    """
    config, store, record = context("food")
    weight_config, weight_store, weight_record = context("weight")
    unit = display_unit(weight_config, unit)
    clock = Clock(config.timezone)
    until = clock.today()
    since = until - dt.timedelta(days=days - 1)
    window = (since.isoformat(), until.isoformat())

    buckets = {}

    def bucket(day):
        return buckets.setdefault(day, {
            "kcal": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0,
            "fiber": 0.0, "sugar": 0.0, "sodium_mg": 0.0, "entries": 0,
            "readings": [], "first": None, "last": None,
        })

    food_rows, food_broken = entries(store, record)
    for _, path, fm, _ in food_rows:
        day = record.day(fm)
        if not window[0] <= day <= window[1]:
            continue
        cell = bucket(day)
        cell["entries"] += 1
        cell["kcal"] += float(fm.get("kcal") or 0)
        cell["carbs"] += float(fm.get("carbs_g") or 0)
        cell["fat"] += float(fm.get("fat_g") or 0)
        nutrients = {k.upper(): v for k, v in (fm.get("nutrients") or {}).items()}
        cell["protein"] += float(nutrients.get("PROTEIN") or 0)
        cell["fiber"] += float(nutrients.get("DIETARY_FIBER") or 0)
        cell["sugar"] += float(nutrients.get("SUGAR") or 0)
        cell["sodium_mg"] += float(nutrients.get("SODIUM") or 0) * 1000
        stamp = str(fm["start"])[11:16]
        cell["first"] = stamp if cell["first"] is None else min(cell["first"], stamp)
        cell["last"] = stamp if cell["last"] is None else max(cell["last"], stamp)

    weight_rows, weight_broken = entries(weight_store, weight_record)
    for _, path, fm, _ in weight_rows:
        day = weight_record.day(fm)
        if not window[0] <= day <= window[1]:
            continue
        bucket(day)["readings"].append((str(fm["time"]), float(fm["weight_kg"])))

    # Google's daily calories burned, as last pulled. Today's is a running total.
    burned_days = burned.load(config)

    def shown(kilograms):
        return (
            round(kilograms / POUND_KG, 2) if unit == "lb"
            else tidy_numbers(round(kilograms, 3))
        )

    rows, logged, weighed = [], 0, 0
    for offset in range((until - since).days + 1):
        day = (since + dt.timedelta(days=offset)).isoformat()
        cell = buckets.get(day)
        has_food = bool(cell and cell["entries"])
        readings = sorted(cell["readings"]) if cell else []
        logged += 1 if has_food else 0
        weighed += 1 if readings else 0

        # The morning reading is the comparable one; an evening weigh-in is a
        # different measurement, so the series takes the first of the day and
        # reports the rest rather than averaging them together.
        first = readings[0][1] if readings else None
        protein = cell["protein"] if has_food else 0.0
        carbs = cell["carbs"] if has_food else 0.0
        fat = cell["fat"] if has_food else 0.0
        accounted = protein * 4 + carbs * 4 + fat * 9

        rows.append({
            "day": day,
            "entries": cell["entries"] if cell else 0,
            "kcal": tidy_numbers(round(cell["kcal"], 1)) if has_food else None,
            "protein": tidy_numbers(round(protein, 1)) if has_food else None,
            "carbs": tidy_numbers(round(carbs, 1)) if has_food else None,
            "fat": tidy_numbers(round(fat, 1)) if has_food else None,
            "fiber": tidy_numbers(round(cell["fiber"], 1)) if has_food else None,
            "sugar": tidy_numbers(round(cell["sugar"], 1)) if has_food else None,
            "sodium_mg": tidy_numbers(round(cell["sodium_mg"], 1)) if has_food else None,
            # kcal the macros do not account for; drawn as its own stack segment
            # rather than normalised away, which would fabricate precision.
            "unaccounted_kcal": (
                tidy_numbers(round(max(cell["kcal"] - accounted, 0), 1)) if has_food else None
            ),
            "first_entry": cell["first"] if has_food else None,
            "last_entry": cell["last"] if has_food else None,
            "burned": (
                tidy_numbers(round(float(burned_days[day]["kcal"]), 1))
                if isinstance(burned_days.get(day), dict) and burned_days[day].get("kcal") is not None
                else None
            ),
            "weight": shown(first) if first is not None else None,
            "weight_readings": [
                {"time": time[11:16], "value": shown(value)} for time, value in readings
            ],
        })

    # Runs of three or more consecutive days without a reading. The threshold
    # lives here so every caller breaks its line in the same places.
    gaps, run = [], []
    for row in rows:
        if row["weight"] is None:
            run.append(row["day"])
            continue
        if len(run) >= 3:
            gaps.append({"from": run[0], "to": run[-1], "days": len(run)})
        run = []
    if len(run) >= 3:
        gaps.append({"from": run[0], "to": run[-1], "days": len(run)})

    return {
        "since": since.isoformat(),
        "until": until.isoformat(),
        "today": until.isoformat(),
        "days": days,
        "unit": unit,
        "timezone": config.timezone,
        "targets": targets(),
        "rows": rows,
        "gaps": gaps,
        "coverage": {
            "days_in_range": len(rows),
            "days_logged": logged,
            "days_weighed": weighed,
        },
        "broken": [f"{store.rel(p)}: {e}" for p, e in food_broken]
        + [f"{weight_store.rel(p)}: {e}" for p, e in weight_broken],
    }


def food_search(keyword=""):
    """Latest entry per distinct name, ordered exactly as `food clone` orders it.

    The position in this list is the ``--index`` that clone expects, so the
    browser can pick a match without answering clone's prompt.
    """
    config, store, record = context("food")
    rows, _ = entries(store, record)
    latest = {}
    for state, path, fm, body in rows:
        name = str(fm.get("name", "")).strip().lower()
        if keyword and keyword.lower() not in name:
            continue
        if name not in latest or fm["start"] > latest[name][2]["start"]:
            latest[name] = (state, path, fm, body)
    ranked = sorted(latest.values(), key=lambda item: item[2]["start"], reverse=True)
    matches = []
    for position, (state, path, fm, body) in enumerate(ranked[:10], 1):
        row = food_row(state, store, path, fm, body)
        row["index"] = position          # only meaningful while keyword is set
        matches.append(row)
    return {"keyword": keyword, "matches": matches, "total": len(ranked)}


SETTINGS = ROOT / ".hsync-web.json"
DEFAULT_TARGETS = {
    "daily_kcal": None,
    "daily_protein_g": None,
    "weight_unit": None,
    # kcal a day to stay under calories burned; 0 means aim to match them.
    "daily_deficit_kcal": 0,
}


def targets(values=None):
    """Display preferences for the web app.

    Kept out of config.toml deliberately: this file belongs to the web app, and
    writing the CLI's config would change what every terminal command prints.
    `weight_unit` here is a display override; null means follow the CLI's
    configured unit. It changes nothing on disk or at Google, which store
    kilograms and grams respectively.
    """
    if values is not None:
        # Merge rather than replace: a caller that does not know about a
        # setting must not be able to erase it.
        clean = targets()
        for key in ("daily_kcal", "daily_protein_g"):
            if key not in values:
                continue
            raw = values[key]
            if raw in (None, ""):
                clean[key] = None
                continue
            number = float(raw)
            if not 0 < number <= 100000:
                raise ValueError(f"{key} is out of range")
            clean[key] = tidy_numbers(number)
        if "daily_deficit_kcal" in values:
            raw = values["daily_deficit_kcal"]
            number = 0.0 if raw in (None, "") else float(raw)
            if not 0 <= number <= 5000:
                raise ValueError("daily_deficit_kcal is out of range")
            clean["daily_deficit_kcal"] = tidy_numbers(number)
        if "weight_unit" in values:
            unit = values["weight_unit"]
            if unit not in (None, "", "kg", "lb"):
                raise ValueError("weight_unit must be kg or lb")
            clean["weight_unit"] = unit or None
        SETTINGS.write_text(json.dumps(clean, indent=2))
        return clean
    if not SETTINGS.exists():
        return dict(DEFAULT_TARGETS)
    stored = json.loads(SETTINGS.read_text())
    return {key: stored.get(key, default) for key, default in DEFAULT_TARGETS.items()}


def display_unit(config, requested=None):
    """The unit to render in: an explicit request, then the web preference,
    then whatever the CLI is configured to print."""
    if requested in ("kg", "lb"):
        return requested
    stored = targets().get("weight_unit")
    return stored if stored in ("kg", "lb") else config.weight_unit


def locate(kind, relative):
    """Resolve a collection-relative path, refusing anything outside it."""
    if kind not in ("food", "weight"):
        raise Invalid("unknown collection")
    config, store, record = context(kind)
    candidate = (store.directory / relative).resolve()
    if candidate != store.directory and store.directory not in candidate.parents:
        raise Invalid("path is outside the collection")
    if candidate.suffix != ".md":
        raise Invalid("not a record file")
    return config, store, record, candidate


def read_record(kind, relative):
    """One record in full, including the private body, for an edit form."""
    from healthsync.store import read_entry

    config, store, record, path = locate(kind, relative)
    if not path.is_file():
        raise Invalid("no such record")
    fm, body = read_entry(path)
    row = (
        food_row("synced", store, path, fm, body)
        if kind == "food"
        else weight_row("synced", store, path, fm, body, display_unit(config))
    )
    row["state"] = "edited" if record.dirty(fm) else (
        "new" if not fm.get("id") else "synced"
    )
    if not fm.get("id") and (fm.get("sync") or {}).get("created"):
        row["state"] = "awaiting pull"
    row["kind"] = kind
    row["pending"] = store.rel(path) in store.operations()
    return row


def overview():
    """Per-collection counts and configuration for the sync surface."""
    result = {"collections": []}
    for kind in ("food", "weight"):
        try:
            config, store, record = context(kind)
            by_id, new, orphans, broken = store.scan()
            dirty = [item for item in by_id.values() if record.dirty(item[1])]
            deletes = store.pending_deletes(by_id)
            operations = store.operations()
            result["collections"].append({
                "kind": kind,
                "directory": str(config.directory),
                "index": str(config.index),
                "timezone": config.timezone,
                "weight_unit": config.weight_unit,
                "source": str(config.source) if config.source else None,
                "ghealth": str(config.ghealth),
                "synced": len(by_id) - len(dirty),
                "edited": len(dirty),
                "new": len(new),
                "deleted": len(deletes),
                "awaiting": len(orphans),
                "pending": len(operations),
                "details": {
                    "edited": [record.summary(fm) for _, fm, _ in dirty][:20],
                    "new": [record.summary(fm) for _, fm, _ in new][:20],
                    "deleted": [
                        meta.get("summary", eid) for eid, meta in deletes.items()
                    ][:20],
                    "awaiting": [store.rel(path) for path, _, _ in orphans][:20],
                    "pending": [
                        f"{op['path']}: {op['action']} {op['state']}"
                        for op in operations.values()
                    ][:20],
                    "broken": [f"{store.rel(p)}: {e}" for p, e in broken][:20],
                },
            })
        except (ValueError, TypeError, KeyError, OSError) as exc:
            result["collections"].append({"kind": kind, "error": str(exc)})
    return result


# Editing and deleting -------------------------------------------------------
#
# The CLI has no edit or delete command: both are filesystem operations that a
# later push reconciles. Doing them here means honouring the rules the engine
# relies on, so the list of refusals below is longer than the list of actions.
#
# The invariants, each of which the engine would otherwise break on:
#   * `id`, the whole `sync` block, `source` and `food_ref` are never written
#     from a request. `sync.digest` in particular stays at its OLD value, which
#     is what marks the record "edited" and what conflict detection compares
#     against. Updating it would make the edit invisible to push and let the
#     next pull overwrite it.
#   * The private Markdown body is carried across; nothing else can recover it.
#   * The candidate is validated before anything is written. An invalid file
#     blocks pull, push, status and tidy for the whole collection.
#   * The collection lock is held for the write and released before any
#     subprocess starts. `hsync` takes the same lock non-blockingly, so holding
#     it across a subprocess would make every command fail instantly.

FOOD_EDITABLE = ("meal", "name", "start", "end", "kcal", "carbs_g", "fat_g",
                 "nutrients", "serving")
WEIGHT_EDITABLE = ("time", "weight_kg", "remote_notes")
NUTRIENT_KEYS = {"protein": "PROTEIN", "sugar": "SUGAR", "fiber": "DIETARY_FIBER"}

# One mutation at a time per collection within this process. Store.locked()
# is per open file description, so two threads would otherwise collide on it
# and one would get a bare "another command is using ..." error.
MUTEX = {"food": threading.Lock(), "weight": threading.Lock()}
# One CLI process at a time, and no in-process edit while one runs. A sync
# started by the browser regaining focus takes a few seconds; an edit made
# meanwhile waits for it rather than failing on the collection lock.
CLI_LOCK = threading.Lock()
CLI_WAIT = 30


class Refused(ValueError):
    """A request the collection's state does not permit right now."""


def optional(values, key):
    """A field the request omitted entirely, versus one it cleared."""
    if key not in values:
        return False, None
    raw = values[key]
    return True, (None if raw in (None, "") else raw)


def scaled_food(fm, amount):
    """Rescale a food to a new serving amount.

    Everything that is a total for the portion scales, including nutrients the
    web form never shows. Doing this here rather than in the browser is what
    keeps a hidden nutrient like SATURATED_FAT from going stale while the
    visible macros move, which is also what `food clone` guarantees.
    """
    serving = fm.get("serving") or {}
    before = number(serving.get("amount", 1), "amount")
    after = number(amount, "amount")
    if before <= 0 or after <= 0:
        raise Refused("serving amount must be greater than zero")
    factor = after / before
    if factor == 1:
        return fm
    for key in ("kcal", "carbs_g", "fat_g"):
        if fm.get(key) is not None:
            fm[key] = tidy_numbers(round(float(fm[key]) * factor, 6))
    if fm.get("nutrients"):
        fm["nutrients"] = {
            key: tidy_numbers(round(float(value) * factor, 6))
            for key, value in fm["nutrients"].items()
        }
    fm["serving"] = {"amount": tidy_numbers(after), "unit": serving.get("unit", "serving")}
    return fm


def edited_food(fm, values, clock):
    candidate = dict(fm)
    # Scale first, then let any explicitly submitted figure override the result.
    if values.get("amount") not in (None, ""):
        candidate = scaled_food(candidate, values["amount"])
    for key, field in (("meal", "meal"), ("name", "name")):
        present, raw = optional(values, field)
        if present and raw is not None:
            candidate[key] = str(raw).upper() if key == "meal" else str(raw)

    for key, field in (("kcal", "kcal"), ("carbs_g", "carbs"), ("fat_g", "fat")):
        present, raw = optional(values, field)
        if present:
            candidate[key] = None if raw is None else float(raw)
            if candidate[key] is None:
                candidate.pop(key, None)

    nutrients = dict(candidate.get("nutrients") or {})
    for field, name in NUTRIENT_KEYS.items():
        present, raw = optional(values, field)
        if present:
            nutrients.pop(name, None) if raw is None else nutrients.update({name: float(raw)})
    present, raw = optional(values, "sodium_mg")
    if present:
        nutrients.pop("SODIUM", None) if raw is None else nutrients.update(
            {"SODIUM": float(raw) / 1000}
        )
    candidate["nutrients"] = nutrients or None
    if not nutrients:
        candidate.pop("nutrients", None)

    serving = dict(candidate.get("serving") or {})
    present, raw = optional(values, "unit")
    if present and raw is not None:
        serving["unit"] = str(raw)
    if serving:
        candidate["serving"] = serving

    if values.get("date") or values.get("at"):
        stamp, _ = clock.entry_time(
            values.get("date") or str(fm["start"])[:10],
            values.get("at") or str(fm["start"])[11:16],
        )
        # Preserve the interval's length rather than collapsing it to a minute.
        old_start = dt.datetime.fromisoformat(str(fm["start"]))
        span = dt.timedelta(minutes=1)
        if fm.get("end"):
            span = max(dt.datetime.fromisoformat(str(fm["end"])) - old_start, span)
        candidate["start"] = stamp
        candidate["end"] = (
            dt.datetime.fromisoformat(stamp) + span
        ).isoformat(timespec="seconds")
    return candidate


def edited_weight(fm, values, clock):
    candidate = dict(fm)
    present, raw = optional(values, "value")
    if present and raw is not None:
        unit = values.get("unit") or "kg"
        if unit not in ("kg", "lb"):
            raise Refused("unit must be kg or lb")
        candidate["weight_kg"] = float(raw) * POUND_KG if unit == "lb" else float(raw)
    present, raw = optional(values, "remote_note")
    if present:
        candidate["remote_notes"] = raw or ""
    if values.get("date") or values.get("at"):
        stamp, _ = clock.entry_time(
            values.get("date") or str(fm["time"])[:10],
            values.get("at") or str(fm["time"])[11:16],
        )
        candidate["time"] = stamp
    return candidate


def ready(store, record, relative):
    """Shared preconditions. Raises Refused; the caller holds the lock."""
    by_id, new, orphans, broken = store.scan()
    if broken:
        raise Refused(
            "unreadable records in this collection; fix them before editing"
        )
    store.load_index()
    if store.operations():
        raise Refused(
            "a recovery operation is pending; run a pull first, then retry"
        )
    for path, fm, body in orphans:
        if store.rel(path) == relative:
            raise Refused(
                "this record was created but has no id yet; pull first so it can "
                "be matched to Google Health"
            )
    for path, fm, body in list(by_id.values()) + new:
        if store.rel(path) == relative:
            return path, fm, body
    raise Refused("no such record")


def mutate(kind, relative, values=None, delete=False):
    """Edit or delete one record. Returns a summary of what changed."""
    if not CLI_LOCK.acquire(timeout=CLI_WAIT):
        raise Refused("a command is still running against this collection; try again")
    try:
        return _mutate(kind, relative, values, delete)
    finally:
        CLI_LOCK.release()


def _mutate(kind, relative, values, delete):
    config, store, record, path = locate(kind, relative)
    with MUTEX[kind]:
        with store.locked():                      # released before any subprocess
            path, fm, body = ready(store, record, relative)

            if delete:
                staged = bool(fm.get("id")) and fm["id"] in store.load_index()
                path.unlink()
                if path.parent != store.directory and not any(path.parent.iterdir()):
                    path.parent.rmdir()
                # The absent file IS the deletion request. The index entry that
                # now has no file is what stages the remote delete; touching the
                # index or the journal here would lose or duplicate that.
                return {"deleted": relative, "staged_remote_delete": staged}

            if kind == "food" and fm.get("food_ref") and "name" in (values or {}):
                if str(values["name"]) != str(fm.get("name", "")):
                    raise Refused(
                        "this food references Google's catalog, so its name comes "
                        "from that reference and a rename would not reach Google"
                    )
            clock = Clock(config.timezone)
            candidate = (
                edited_food(fm, values or {}, clock)
                if kind == "food"
                else edited_weight(fm, values or {}, clock)
            )
            # Identity and provenance are never taken from the request.
            allowed = FOOD_EDITABLE if kind == "food" else WEIGHT_EDITABLE
            for key in list(candidate):
                if key not in allowed and key in fm:
                    candidate[key] = fm[key]
            for key in ("id", "sync", "source", "food_ref"):
                if key in fm:
                    candidate[key] = fm[key]
                else:
                    candidate.pop(key, None)

            record.validate(candidate)            # normalizes in place; raises
            if record.digest(candidate) == record.digest(fm):
                return {"path": relative, "changed": False}
            note = values.get("note") if values else None
            write_entry(path, candidate, body if note is None else str(note))
            moved = store.relocate(path, candidate)
            return {
                "path": store.rel(moved),
                "changed": True,
                "state": "edited" if candidate.get("id") else "new",
            }


class Handler(BaseHTTPRequestHandler):
    server_version = "hsync-web"

    def log_message(self, fmt, *args):  # Quieter than the default access log.
        sys.stderr.write(f"  {self.address_string()} {fmt % args}\n")

    def send(self, status, body, content_type):
        payload = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def json(self, status, body):
        self.send(status, json.dumps(body), "application/json; charset=utf-8")

    def do_GET(self):
        path, _, raw_query = self.path.partition("?")
        query = urllib.parse.parse_qs(raw_query)

        def one(name, default=None):
            return query.get(name, [default])[0]

        try:
            if path == "/api/spec":
                return self.json(200, SPEC)
            if path == "/api/day":
                return self.json(200, day_view(one("date")))
            if path == "/api/weight":
                days = max(1, min(int(one("days", 90) or 90), 3650))
                return self.json(200, weight_view(days, one("unit")))
            if path == "/api/month":
                return self.json(200, month_view(one("month")))
            if path == "/api/series":
                span = max(7, min(int(one("days", 180) or 180), 1830))
                return self.json(200, series_view(span, one("unit")))
            if path == "/api/foods":
                return self.json(200, food_search((one("q", "") or "").strip()))
            if path == "/api/overview":
                return self.json(200, overview())
            if path == "/api/targets":
                return self.json(200, targets())
            if path == "/api/record":
                return self.json(200, read_record(one("kind"), one("path") or ""))
        except (Invalid, ValueError, TypeError, KeyError, OSError) as exc:
            return self.json(400, {"error": str(exc)})

        return self.static(path)

    TYPES = {
        ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
        ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon",
        ".png": "image/png", ".woff2": "font/woff2", ".map": "application/json",
    }

    def static(self, path):
        """Serve the built app, refusing any path that escapes web/dist."""
        if not STATIC.is_dir():
            return self.send(
                503,
                "<h1>The web app is not built</h1>"
                "<p>Run <code>pnpm install &amp;&amp; pnpm build</code> in "
                "<code>web/</code>, or <code>pnpm dev</code> for hot reload.</p>",
                "text/html; charset=utf-8",
            )
        # Decode before resolving, so an encoded traversal is caught by the
        # containment check rather than merely failing to name a real file.
        target = (STATIC / urllib.parse.unquote(path).lstrip("/")).resolve()
        if target.is_dir():
            target = target / "index.html"
        if STATIC not in target.parents and target != STATIC:
            return self.json(404, {"error": "not found"})
        if not target.is_file():
            # Unknown paths fall back to the app shell so client routing works.
            target = STATIC / "index.html"
            if not target.is_file():
                return self.json(404, {"error": "not found"})
        kind = self.TYPES.get(target.suffix, "application/octet-stream")
        charset = "; charset=utf-8" if kind.startswith(("text/", "application/json")) else ""
        self.send(200, target.read_bytes(), f"{kind}{charset}")

    def body(self):
        length = int(self.headers.get("Content-Length") or 0)
        payload = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(payload, dict):
            raise Invalid("expected an object")
        return payload

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        try:
            payload = self.body()
            if path == "/api/targets":
                return self.json(200, targets(payload))
            if path == "/api/sync":
                return self.json(200, sync_run(payload))
            if path != "/api/run":
                return self.json(404, {"error": "not found"})
            arguments = argv(payload)
        except (Invalid, ValueError, json.JSONDecodeError) as exc:
            return self.json(400, {"error": str(exc)})
        result = run(arguments)
        result["command"] = preview(arguments)
        self.json(200, result)

    def do_PATCH(self):
        if self.path.split("?", 1)[0] != "/api/record":
            return self.json(404, {"error": "not found"})
        try:
            payload = self.body()
            result = mutate(
                payload.get("kind"), payload.get("path") or "",
                values=payload.get("values") or {},
            )
        except Refused as exc:
            return self.json(409, {"error": str(exc), "refused": True})
        except (Invalid, ValueError, TypeError, KeyError, OSError,
                json.JSONDecodeError) as exc:
            return self.json(400, {"error": str(exc)})
        self.json(200, result)

    def do_DELETE(self):
        if self.path.split("?", 1)[0] != "/api/record":
            return self.json(404, {"error": "not found"})
        try:
            payload = self.body()
            result = mutate(payload.get("kind"), payload.get("path") or "", delete=True)
        except Refused as exc:
            return self.json(409, {"error": str(exc), "refused": True})
        except (Invalid, ValueError, TypeError, KeyError, OSError,
                json.JSONDecodeError) as exc:
            return self.json(400, {"error": str(exc)})
        self.json(200, result)


def main(argument_list=None):
    arguments = sys.argv[1:] if argument_list is None else argument_list
    port = int(arguments[0]) if arguments else 8787
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"hsync web on http://127.0.0.1:{port}  (ctrl-c to stop)")
    if not STATIC.is_dir():
        print("  the web app is not built: run 'pnpm install && pnpm build' in web/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()
    return 0
