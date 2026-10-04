"""Stable serialization and explicit local time handling."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import os
import re
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def tidy_numbers(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: tidy_numbers(v) for k, v in value.items()}
    if isinstance(value, list):
        return [tidy_numbers(v) for v in value]
    return value


def digest_fields(fm, fields):
    # Preserve fsync's existing food digests byte for byte.
    payload = {
        k: tidy_numbers(fm.get(k)) for k in fields if fm.get(k) not in (None, "", {})
    }
    blob = json.dumps(payload, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def timestamp_fraction(value):
    # datetime retains microseconds; Google timestamps may carry nanoseconds.
    # Preserve the original fraction while converting the whole seconds.
    match = re.search(r"[T ]\d{2}:\d{2}:\d{2}(\.\d+)", str(value))
    digits = match[1][1:].rstrip("0") if match else ""
    # Match datetime.isoformat's legacy six-digit representation where possible.
    return "." + digits.ljust(6, "0") if digits else ""


def from_api_time(utc, offset=None):
    value = dt.datetime.fromisoformat(utc.replace("Z", "+00:00"))
    seconds = int((offset or "0s").rstrip("s"))
    local = value.astimezone(dt.timezone(dt.timedelta(seconds=seconds))).isoformat(
        timespec="seconds"
    )
    return local[:19] + timestamp_fraction(utc) + local[19:]


def to_api_time(local):
    value = dt.datetime.fromisoformat(str(local))
    if value.tzinfo is None:
        raise ValueError("timestamps must include a UTC offset")
    offset = int(value.utcoffset().total_seconds())
    utc = value.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    return utc + timestamp_fraction(local) + "Z", f"{offset}s"


def number(value, name):
    if isinstance(value, bool):
        raise TypeError(f"{name} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a finite number") from None
    if not math.isfinite(result):
        raise ValueError(f"{name} must be a finite number")
    return result


class Clock:
    def __init__(self, timezone="America/Los_Angeles"):
        self.zone = ZoneInfo(timezone)

    def now(self):
        return dt.datetime.now(self.zone).replace(microsecond=0)

    def today(self):
        return self.now().date()

    def date(self, value):
        if value in (None, "today"):
            return self.today()
        if value == "yesterday":
            return self.today() - dt.timedelta(days=1)
        return dt.date.fromisoformat(value)

    def entry_time(self, date=None, at=None):
        day = self.date(date)
        placeholder = date is not None and day != self.today() and at is None
        if at:
            if not re.fullmatch(r"\d{1,2}:\d{2}", at):
                raise ValueError("--at takes a real local time in HH:MM format")
            at = at.zfill(5)
        time = (
            dt.time.fromisoformat(at)
            if at
            else (dt.time(12) if placeholder else self.now().time())
        )
        if time.tzinfo is not None:
            raise ValueError(
                "--at takes local HH:MM; timezone comes from configuration"
            )
        value = dt.datetime.combine(day, time, self.zone)
        if value.astimezone(dt.timezone.utc).astimezone(self.zone) != value:
            raise ValueError(
                "that local time does not exist due to daylight saving time"
            )
        return value.isoformat(timespec="seconds"), placeholder
