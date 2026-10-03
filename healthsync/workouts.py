"""Workout sessions, read from Google Health; never written back.

Each workout is one exercise session recorded by a Fitbit device: a type
(``RUNNING``, ``BIKING``, ...), a start and end time, and the session summary
Google computes (distance, calories, average heart rate, steps, active zone
minutes). Sessions from other platforms, such as Apple Watch through Apple
Health, are skipped; they often duplicate a Fitbit session.

``pull`` mirrors the pulled window into ``workouts.json`` in the data directory,
keyed by Google's data point ID: new and changed sessions are saved, and saved
sessions in the window that Google no longer returns are removed. Run distance
is derived from the saved sessions.
"""

from __future__ import annotations

import datetime as dt
import json

from healthsync.activity import MM_PER_MILE, SOURCE, ghealth
from healthsync.common import write_atomic

FILE = "workouts.json"
# Outdoor runs and treadmill sessions both count toward run distance.
RUN_TYPES = ("RUNNING", "TREADMILL")


def path(cfg):
    # cfg is any collection's Config; the file sits beside food/ and weight/.
    return cfg.directory.parent / FILE


def load(cfg):
    try:
        data = json.loads(path(cfg).read_text())
    except FileNotFoundError:
        return {}
    return data.get("workouts", {}) if isinstance(data, dict) else {}


def save(cfg, workouts):
    ordered = dict(sorted(workouts.items(), key=lambda item: item[1]["start"]))
    write_atomic(path(cfg), json.dumps({"workouts": ordered}, indent=1) + "\n")


def local(stamp, zone):
    instant = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    return instant.astimezone(zone).isoformat(timespec="seconds")


def session(point, zone):
    """One Fitbit exercise data point as (id, fields), or None to skip it."""
    if (point.get("dataSource") or {}).get("platform") != SOURCE:
        return None
    exercise = point.get("exercise") or {}
    interval = exercise.get("interval") or {}
    if not point.get("name") or not interval.get("startTime"):
        return None
    summary = exercise.get("metricsSummary") or {}
    fields = {
        "type": exercise.get("exerciseType"),
        "name": exercise.get("displayName"),
        "start": local(interval["startTime"], zone),
        "end": local(interval["endTime"], zone) if interval.get("endTime") else None,
        "device": ((point.get("dataSource") or {}).get("device") or {}).get("displayName"),
    }
    if exercise.get("activeDuration"):
        fields["active_s"] = round(float(exercise["activeDuration"].rstrip("s")))
    for name, source, convert in (
        ("distance_m", "distanceMillimeters", lambda v: round(int(v) / 1000, 1)),
        ("kcal", "caloriesKcal", lambda v: round(float(v))),
        ("avg_hr", "averageHeartRateBeatsPerMinute", int),
        ("steps", "steps", int),
        ("azm", "activeZoneMinutes", int),
    ):
        if summary.get(source) is not None:
            fields[name] = convert(summary[source])
    return point["name"].rsplit("/", 1)[-1], {k: v for k, v in fields.items() if v is not None}


def fetch(binary, since, until, zone):
    """Fitbit sessions starting on the local days since through until."""
    payload = ghealth(
        binary, "exercise",
        ["list", "--from", since.isoformat(), "--to", until.isoformat(), "--limit", "1000000"],
    )
    found = {}
    for point in payload.get("dataPoints") or []:
        parsed = session(point, zone)
        if parsed:
            found[parsed[0]] = parsed[1]
    return found


def merge(stored, fetched, since, until, stamp):
    """Apply a window's fetch to the saved sessions; returns (new, changed, removed)."""
    new = changed = removed = 0
    window = (since.isoformat(), until.isoformat())
    for key in [k for k, v in stored.items() if window[0] <= v["start"][:10] <= window[1]]:
        if key not in fetched:
            del stored[key]
            removed += 1
    for key, fields in fetched.items():
        old = stored.get(key)
        if old is None:
            new += 1
        elif {k: v for k, v in old.items() if k != "fetched"} != fields:
            changed += 1
        stored[key] = {**fields, "fetched": stamp}
    return new, changed, removed


def pull(cfg, clock, days):
    """Mirror the last ``days`` days; returns (that window's sessions, counts)."""
    today = clock.today()
    since = today - dt.timedelta(days=days - 1)
    fetched = fetch(cfg.ghealth, since, today, clock.zone)
    stored = load(cfg)
    counts = merge(stored, fetched, since, today, clock.now().isoformat(timespec="seconds"))
    save(cfg, stored)
    return {k: stored[k] for k in fetched}, counts


def run_days(workouts):
    """Run distance per local day: {day: {"meters": total, "runs": count}}."""
    days = {}
    for fields in workouts.values():
        if fields.get("type") not in RUN_TYPES:
            continue
        day = days.setdefault(fields["start"][:10], {"meters": 0.0, "runs": 0})
        day["meters"] = round(day["meters"] + fields.get("distance_m", 0), 1)
        day["runs"] += 1
    return days


def distance(meters):
    mm = meters * 1000
    return f"{mm / 1e6:,.2f} km  {mm / MM_PER_MILE:,.2f} mi"


def describe(fields):
    """One session's numbers for display."""
    parts = [fields.get("name") or fields.get("type") or "workout"]
    if "distance_m" in fields:
        parts.append(distance(fields["distance_m"]))
    if "active_s" in fields:
        parts.append(f"{fields['active_s'] // 60} min")
    if "kcal" in fields:
        parts.append(f"{fields['kcal']} kcal")
    if "avg_hr" in fields:
        parts.append(f"avg {fields['avg_hr']} bpm")
    return "  ".join(parts)
