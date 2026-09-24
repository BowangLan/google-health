"""Instantaneous weight readings; files store kilograms, Google stores grams."""

from healthsync.common import from_api_time, number, tidy_numbers, to_api_time
from healthsync.records.base import Record

POUND_KG = 0.45359237


class Weight(Record):
    kind = "weight"
    api_type = "weight"
    payload_key = "weight"
    time_field = "time"
    update_strategy = "patch"
    owned = ("time", "weight_kg", "remote_notes")

    def label(self, fm):
        return "weight"

    def summary(self, fm, unit="kg"):
        kg = number(fm["weight_kg"], "weight_kg")
        return f"{kg / POUND_KG:.2f} lb" if unit == "lb" else f"{kg:g} kg"

    def normalize(self, fm):
        value = number(fm.get("weight_kg"), "weight_kg")
        if not 0 <= value <= 1000:
            raise ValueError("weight_kg must be between 0 and 1000")
        fm["weight_kg"] = tidy_numbers(round(value, 9))
        utc, offset = to_api_time(fm.get("time", ""))
        fm["time"] = from_api_time(utc, offset)
        if "remote_notes" in fm and not isinstance(fm["remote_notes"], str):
            raise ValueError("remote_notes must be text")
        return fm

    validate = normalize

    def digest(self, fm):
        return super().digest(self.normalize(dict(fm)))

    def remote_to_fm(self, dp):
        weight = dp["weight"]
        sample = weight["sampleTime"]
        fm = {
            "id": self.identity(dp),
            "time": from_api_time(sample["physicalTime"], sample.get("utcOffset")),
            "weight_kg": number(weight["weightGrams"], "weightGrams") / 1000,
        }
        if weight.get("notes"):
            fm["remote_notes"] = weight["notes"]
        if (dp.get("dataSource") or {}).get("platform"):
            fm["source"] = dp["dataSource"]["platform"]
        return self.normalize(fm)

    def fm_to_remote(self, fm):
        self.normalize(fm)
        utc, offset = to_api_time(fm["time"])
        return {
            "weight": {
                "weightGrams": round(fm["weight_kg"] * 1000, 6),
                "sampleTime": {"physicalTime": utc, "utcOffset": offset},
                "notes": fm.get("remote_notes", ""),
            }
        }

    def match_key(self, fm):
        # Time + value; notes can be edited while a create awaits reconciliation.
        utc, _ = to_api_time(fm["time"])
        return utc, round(number(fm["weight_kg"], "weight_kg"), 9)
