"""Food schema. Nutrient numbers are totals for the portion eaten."""

from __future__ import annotations

import datetime as dt
from typing import Any

from healthsync.common import from_api_time, number, tidy_numbers, to_api_time
from healthsync.records.base import Record

MEALS = {"BREAKFAST", "LUNCH", "DINNER", "SNACK", "ANYTIME"}


class Food(Record):
    kind = "food"
    api_type = "nutrition-log"
    payload_key = "nutritionLog"
    time_field = "start"
    update_strategy = "replace"
    owned = (
        "meal",
        "name",
        "start",
        "end",
        "kcal",
        "carbs_g",
        "fat_g",
        "nutrients",
        "serving",
        "food_ref",
    )

    def comparable(self, fm):
        """Google omits zero nutrients; absence and zero compare identically."""
        result = dict(fm)
        nutrients = {
            key: value for key, value in (fm.get("nutrients") or {}).items()
            if float(value) != 0
        }
        if nutrients:
            result["nutrients"] = nutrients
        else:
            result.pop("nutrients", None)
        return result

    def digest(self, fm):
        return super().digest(self.comparable(fm))

    def matches_digest(self, fm, digest):
        # Accept a legacy baseline only when these actual fields reproduce it.
        # Never guess the content of a missing or edited legacy record.
        return digest in (self.digest(fm), super().digest(fm))

    def diff(self, local, remote):
        return super().diff(self.comparable(local), self.comparable(remote))

    def label(self, fm):
        return str(fm.get("name", "food"))

    def summary(self, fm, unit=None):
        return f"{self.label(fm)} · {tidy_numbers(fm.get('kcal', 0))} kcal"

    def remote_to_fm(self, dp: dict) -> dict:
        n = dp.get("nutritionLog", {})
        iv = n.get("interval", {})
        fm: dict[str, Any] = {
            "id": self.identity(dp),
            "meal": n.get("mealType", "ANYTIME"),
            "name": n.get("foodDisplayName", ""),
            "start": from_api_time(iv.get("startTime", ""), iv.get("startUtcOffset")),
            "kcal": (n.get("energy") or {}).get("kcal"),
        }
        if iv.get("endTime"):
            fm["end"] = from_api_time(iv["endTime"], iv.get("endUtcOffset"))
        if (n.get("totalCarbohydrate") or {}).get("grams") is not None:
            fm["carbs_g"] = n["totalCarbohydrate"]["grams"]
        if (n.get("totalFat") or {}).get("grams") is not None:
            fm["fat_g"] = n["totalFat"]["grams"]
        nutrients = {
            x["nutrient"]: x["quantity"]["grams"]
            for x in n.get("nutrients", [])
            if x.get("nutrient") and (x.get("quantity") or {}).get("grams") is not None
        }
        if nutrients:
            fm["nutrients"] = nutrients
        sv = n.get("serving") or {}
        if sv:
            fm["serving"] = {
                "amount": sv.get("amount", 1),
                "unit": sv.get("foodMeasurementUnitDisplayName", "serving"),
            }
        # Identified foods reference Google's catalog rather than naming the food
        # inline. Both use the engine's create-then-delete replacement path.
        if n.get("food"):
            fm["food_ref"] = n["food"]
        src = dp.get("dataSource") or {}
        if src.get("platform"):
            fm["source"] = src["platform"]
        return fm

    def fm_to_remote(self, fm: dict) -> dict:
        for key in ("meal", "name", "start", "kcal"):
            if fm.get(key) in (None, ""):
                raise ValueError(f"'{key}' is required")
        meal = str(fm["meal"]).upper()
        if meal not in MEALS:
            raise ValueError(f"meal must be one of {', '.join(sorted(MEALS))}")
        try:
            kcal = float(fm["kcal"])
        except (TypeError, ValueError):
            raise ValueError(f"kcal must be a number, got {fm['kcal']!r}")

        # Write every normalised value back into the frontmatter. Whatever this
        # function changes on the way out — case, type — has to land in the file
        # too, or the file disagrees with what the API stored and every later diff
        # reports a change nobody made. `meal: SNACk` was exactly that.
        fm["meal"] = meal
        fm["name"] = str(fm["name"])
        fm["kcal"] = tidy_numbers(kcal)
        for key in ("carbs_g", "fat_g"):
            if fm.get(key) is not None:
                try:
                    fm[key] = tidy_numbers(float(fm[key]))
                except (TypeError, ValueError):
                    raise ValueError(f"{key} must be a number, got {fm[key]!r}")
        if fm.get("nutrients"):
            clean = {}
            for k, v in dict(fm["nutrients"]).items():
                try:
                    clean[str(k).upper()] = tidy_numbers(float(v))
                except (TypeError, ValueError):
                    raise ValueError(f"nutrient {k} must be a number, got {v!r}")
            fm["nutrients"] = clean
        sv0 = fm.get("serving") or {}
        try:
            amount = float(sv0.get("amount", 1))
        except (TypeError, ValueError):
            raise ValueError(
                f"serving amount must be a number, got {sv0.get('amount')!r}"
            )
        fm["serving"] = {
            "amount": tidy_numbers(amount),
            "unit": str(sv0.get("unit", "serving")),
        }

        su, so = to_api_time(fm["start"])
        if not fm.get("end"):
            # An entry with no end gets one minute, and we write it back into the
            # frontmatter. Sending an end we do not record leaves the file without
            # one while the remote has it, so every later diff reports a change
            # that nobody made — and any local edit then reads as a conflict.
            t = dt.datetime.fromisoformat(str(fm["start"]))
            fm["end"] = (t + dt.timedelta(minutes=1)).isoformat(timespec="seconds")
        eu, eo = to_api_time(fm["end"])
        fm["start"] = from_api_time(su, so)
        fm["end"] = from_api_time(eu, eo)

        n: dict[str, Any] = {
            "interval": {
                "startTime": su,
                "endTime": eu,
                "startUtcOffset": so,
                "endUtcOffset": eo,
            },
            "mealType": meal,
            "energy": {"kcal": kcal, "userProvidedUnit": "CALORIE"},
        }
        if fm.get("food_ref"):
            n["food"] = fm["food_ref"]
        else:
            n["foodDisplayName"] = str(fm["name"])
        if fm.get("carbs_g") is not None:
            n["totalCarbohydrate"] = {"grams": float(fm["carbs_g"])}
        if fm.get("fat_g") is not None:
            n["totalFat"] = {"grams": float(fm["fat_g"])}
        if fm.get("nutrients"):
            n["nutrients"] = [
                {"nutrient": str(k).upper(), "quantity": {"grams": float(v)}}
                for k, v in dict(fm["nutrients"]).items()
            ]
        sv = fm.get("serving") or {}
        n["serving"] = {
            "amount": float(sv.get("amount", 1)),
            "foodMeasurementUnitDisplayName": str(sv.get("unit", "serving")),
        }
        return {"nutritionLog": n}

    def match_key(self, fm: dict) -> tuple:
        """Identity of an entry independent of its id, for reconciling orphans."""
        try:
            t = dt.datetime.fromisoformat(str(fm["start"])).astimezone(dt.timezone.utc)
            stamp = t.replace(microsecond=0).isoformat()
        except (ValueError, TypeError, KeyError):
            stamp = str(fm.get("start"))
        return (
            stamp,
            str(fm.get("name", "")).strip().lower(),
            float(fm.get("kcal") or 0),
        )

    def validate(self, fm):
        self.fm_to_remote(fm)
        for key in ("kcal", "carbs_g", "fat_g"):
            if fm.get(key) is not None and number(fm[key], key) < 0:
                raise ValueError(f"{key} must be nonnegative")
        for key, val in fm.get("nutrients", {}).items():
            if number(val, key) < 0:
                raise ValueError(f"{key} must be nonnegative")
        if number(fm["serving"]["amount"], "amount") <= 0:
            raise ValueError("amount must be greater than zero")
        if dt.datetime.fromisoformat(fm["end"]) < dt.datetime.fromisoformat(
            fm["start"]
        ):
            raise ValueError("end must be at or after start")
        return fm
