"""Steps, distance, and heart rate, read from Google Health; never written back.

Steps and distance are one total per civil day, from Google's daily rollups;
those already exclude other platforms' data when a Fitbit is the source.
Heart rate is one row per local clock hour: the average, minimum, and maximum of
every Fitbit reading in that hour. Google's hourly heart-rate rollup mixes in
Apple Watch readings, so hours are computed here from the raw Fitbit samples
(about 36,000 a day). ``pull`` stores each metric in
its own JSON file in the data directory, beside ``burned.json``; ``list`` reads
that file. The current day or hour is still accumulating, so every row records
when it was fetched.
"""

from __future__ import annotations

import datetime as dt
import json
import subprocess
from dataclasses import dataclass

from healthsync.burned import civil_day, decode
from healthsync.common import write_atomic
from healthsync.google_health import RemoteError

MM_PER_MILE = 1_609_344
SOURCE = "FITBIT"  # the only platform whose data is kept


@dataclass(frozen=True)
class Metric:
    name: str  # hsync command
    type: str  # ghealth data type
    file: str
    hourly: bool  # one row per local hour instead of per civil day
    chunk_days: int  # days per request
    value: object  # rollup point -> stored fields, or None when empty


def _steps(point):
    count = (point.get("steps") or {}).get("countSum")
    return None if count is None else {"steps": int(count)}


def _distance(point):
    mm = (point.get("distance") or {}).get("millimetersSum")
    return None if mm is None else {"meters": round(int(mm) / 1000, 1)}


METRICS = {
    m.name: m
    for m in (
        Metric("steps", "steps", "steps.json", False, 90, _steps),
        Metric("distance", "distance", "distance.json", False, 90, _distance),
        Metric("hr", "heart-rate", "heart-rate.json", True, 1, None),
    )
}


def path(cfg, metric):
    # cfg is any collection's Config; the file sits beside food/ and weight/.
    return cfg.directory.parent / metric.file


def key(metric):
    return "hours" if metric.hourly else "days"


def load(cfg, metric):
    try:
        data = json.loads(path(cfg, metric).read_text())
    except FileNotFoundError:
        return {}
    return data.get(key(metric), {}) if isinstance(data, dict) else {}


def save(cfg, metric, rows):
    body = {key(metric): dict(sorted(rows.items()))}
    write_atomic(path(cfg, metric), json.dumps(body, indent=1) + "\n")


def parse(metric, payload, zone):
    """Map each daily rollup point to (day, fields); empty points are skipped."""
    rows = {}
    for point in payload.get("rollupDataPoints") or []:
        fields = metric.value(point)
        start = point.get("civilStartTime") or point.get("startTime")
        if fields is None or start is None:
            continue
        rows[civil_day(start)] = fields
    return rows


def hours(payload, zone):
    """Fitbit heart-rate samples grouped into local clock hours.

    An hour is keyed by its local start time with offset, so the repeated hour
    when daylight saving time ends stays distinct.
    """
    groups = {}
    for point in payload.get("dataPoints") or []:
        if (point.get("dataSource") or {}).get("platform") != SOURCE:
            continue
        sample = point.get("heartRate") or {}
        stamp = (sample.get("sampleTime") or {}).get("physicalTime")
        if stamp is None or sample.get("beatsPerMinute") is None:
            continue
        local = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone(zone)
        hour = local.replace(minute=0, second=0, microsecond=0).isoformat()
        groups.setdefault(hour, []).append(int(sample["beatsPerMinute"]))
    return {
        hour: {"avg": round(sum(bpm) / len(bpm), 1), "min": min(bpm), "max": max(bpm)}
        for hour, bpm in groups.items()
    }


def utc(moment):
    return moment.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def request(metric, start, end, zone):
    """ghealth arguments for the local days start through end inclusive."""
    if not metric.hourly:
        return ["daily-rollup", "--from", start.isoformat(), "--to", end.isoformat()]
    # Explicit local midnights, so ghealth's own timezone setting is irrelevant.
    begin = dt.datetime.combine(start, dt.time(), zone)
    stop = dt.datetime.combine(end + dt.timedelta(days=1), dt.time(), zone)
    field = "heart_rate.sample_time.physical_time"
    return [
        "list", "--limit", "1000000", "--filter",
        f'{field} >= "{utc(begin)}" AND {field} < "{utc(stop)}"',
    ]


def ghealth(binary, data_type, args):
    """Run one read-only ghealth data command and return its JSON payload."""
    out = subprocess.run(
        [str(binary), "data", data_type, *args, "--raw"],
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
                f" {data_type} needs the activity_and_fitness.readonly"
                " scope: add it in Cloud Console, then run ./auth."
            )
        raise RemoteError(f"{data_type} fetch failed: {message}")
    if payload.get("nextPageToken"):
        # A partial read would silently undercount, so refuse it.
        raise RemoteError(f"{data_type} fetch failed: more pages than the read limit")
    return payload


def fetch(binary, metric, since, until, zone):
    """Rows from since to until inclusive, in requests the API accepts."""
    rows = {}
    start = since
    while start <= until:
        end = min(start + dt.timedelta(days=metric.chunk_days - 1), until)
        payload = ghealth(binary, metric.type, request(metric, start, end, zone))
        rows.update(hours(payload, zone) if metric.hourly else parse(metric, payload, zone))
        start = end + dt.timedelta(days=1)
    return rows


def pull(cfg, clock, metric, days):
    """Fetch the last ``days`` days and merge them into the local file."""
    today = clock.today()
    since = today - dt.timedelta(days=days - 1)
    fetched = fetch(cfg.ghealth, metric, since, today, clock.zone)
    stamp = clock.now().isoformat(timespec="seconds")
    stored = load(cfg, metric)
    for row, fields in fetched.items():
        stored[row] = {**fields, "fetched": stamp}
    save(cfg, metric, stored)
    return {row: stored[row] for row in sorted(fetched)}


def describe(metric, value):
    """One row's numbers for display."""
    if metric.name == "steps":
        return f"{value['steps']:,} steps"
    if metric.name == "distance":
        mm = value["meters"] * 1000
        return f"{mm / 1e6:,.2f} km  {mm / MM_PER_MILE:,.2f} mi"
    return f"avg {value['avg']:.0f}  min {value['min']}  max {value['max']} bpm"
