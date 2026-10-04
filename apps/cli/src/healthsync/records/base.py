"""The small record interface used by the store and synchronization engine."""

import datetime as dt
import re

from healthsync.common import digest_fields, tidy_numbers


class Record:
    def identity(self, dp):
        name = str(dp.get("name", ""))
        eid = name.rsplit("/", 1)[-1]
        if f"/dataTypes/{self.api_type}/dataPoints/" not in name or not re.fullmatch(
            r"[A-Za-z0-9_-]+", eid
        ):
            raise ValueError(f"invalid {self.kind} remote identity")
        return eid

    def digest(self, fm):
        return digest_fields(fm, self.owned)

    def matches_digest(self, fm, digest):
        return digest == self.digest(fm)

    def time(self, fm):
        return str(fm.get(self.time_field, ""))

    def day(self, fm):
        return dt.datetime.fromisoformat(self.time(fm)).date().isoformat()

    def filename(self, fm):
        time = dt.datetime.fromisoformat(self.time(fm)).strftime("%H%M")
        label = (
            re.sub(r"[^a-z0-9]+", "-", self.label(fm).lower())
            .strip("-")[:44]
            .rstrip("-")
            or "entry"
        )
        return (
            "--".join([time, label] + ([str(fm["id"])] if fm.get("id") else [])) + ".md"
        )

    def dirty(self, fm):
        return not self.matches_digest(fm, (fm.get("sync") or {}).get("digest"))

    def diff(self, local, remote):
        return [
            (k, tidy_numbers(local.get(k)), tidy_numbers(remote.get(k)))
            for k in self.owned
            if tidy_numbers(local.get(k)) != tidy_numbers(remote.get(k))
        ]

    def match_key(self, fm):
        stamp = (
            dt.datetime.fromisoformat(self.time(fm))
            .astimezone(dt.timezone.utc)
            .isoformat()
        )
        return stamp, self.digest({k: v for k, v in fm.items() if k != self.time_field})
