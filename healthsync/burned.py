"""Daily calories burned, read from Google Health; never written back.

Google computes one total per civil day (basal plus active energy) from the
devices on the account. ``pull`` stores those totals in ``burned.json`` in the
data directory, and the CLI and web app read that file. Today's total is still
accumulating, so each day records when it was fetched.
"""

from __future__ import annotations

import datetime as dt
import json
import subprocess

from healthsync.common import write_atomic
from healthsync.google_health import RemoteError

FILE = "burned.json"
# The API caps total-calories rollups at 14 days per request.
CHUNK_DAYS = 14


def path(cfg):
    # cfg is any collection's Config; the file sits beside food/ and weight/.
    return cfg.directory.parent / FILE


def load(cfg):
    try:
        data = json.loads(path(cfg).read_text())
    except FileNotFoundError:
        return {}
    return data.get("days", {}) if isinstance(data, dict) else {}


def save(cfg, days):
    write_atomic(path(cfg), json.dumps({"days": dict(sorted(days.items()))}, indent=1) + "\n")


def civil_day(value):
    """A rollup start as YYYY-MM-DD, whether given as a date object or a string."""
    if isinstance(value, dict):
        date = value.get("date", value)
        return dt.date(int(date["year"]), int(date["month"]), int(date["day"])).isoformat()
    return str(value)[:10]


def parse(payload):
    """Map each rollup point to (day, kcal); a day with no data is skipped."""
    totals = {}
    for point in payload.get("rollupDataPoints") or []:
        start = point.get("civilStartTime") or point.get("startTime")
        kcal = (point.get("totalCalories") or {}).get("kcalSum")
        if start is None or kcal is None:
            continue
        totals[civil_day(start)] = round(float(kcal), 1)
    return totals


def decode(text):
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def fetch(binary, since, until):
    """Daily totals from since to until inclusive, in 14-day requests."""
    totals = {}
    start = since
    while start <= until:
        end = min(start + dt.timedelta(days=CHUNK_DAYS - 1), until)
        out = subprocess.run(
            [
                str(binary), "data", "total-calories", "daily-rollup",
                "--from", start.isoformat(), "--to", end.isoformat(), "--raw",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        payload, error = decode(out.stdout), decode(out.stderr).get("error")
        if out.returncode or error or "error" in payload:
            error = error or payload.get("error") or {}
            message = error.get("message") or out.stderr.strip() or out.stdout.strip()
            if error.get("status") == 403 or "scope" in message.lower():
                message += (
                    " Calories burned needs the activity_and_fitness.readonly"
                    " scope: add it in Cloud Console, then run ./auth."
                )
            raise RemoteError(f"calories burned fetch failed: {message}")
        totals.update(parse(payload))
        start = end + dt.timedelta(days=1)
    return totals


def pull(cfg, clock, days):
    """Fetch the last ``days`` days and merge them into the local file."""
    today = clock.today()
    since = today - dt.timedelta(days=days - 1)
    fetched = fetch(cfg.ghealth, since, today)
    stamp = clock.now().isoformat(timespec="seconds")
    stored = load(cfg)
    for day, kcal in fetched.items():
        stored[day] = {"kcal": kcal, "fetched": stamp}
    save(cfg, stored)
    return {day: stored[day] for day in sorted(fetched)}
