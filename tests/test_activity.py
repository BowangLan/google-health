"""Read-only activity rollups parsed from payloads shaped like live API responses."""

import datetime as dt
import unittest
from zoneinfo import ZoneInfo

from healthsync.activity import METRICS, describe, hours, parse, request

LA = ZoneInfo("America/Los_Angeles")


def civil(year, month, day):
    return {"date": {"year": year, "month": month, "day": day}, "time": {}}


class DailyTotals(unittest.TestCase):
    def test_steps_and_distance_by_civil_day(self):
        steps = parse(
            METRICS["steps"],
            {"rollupDataPoints": [
                {"civilStartTime": civil(2026, 10, 2), "steps": {"countSum": "11480"}},
                {"civilStartTime": civil(2026, 10, 3)},
            ]},
            LA,
        )
        self.assertEqual(steps, {"2026-10-02": {"steps": 11480}})
        distance = parse(
            METRICS["distance"],
            {"rollupDataPoints": [
                {"civilStartTime": civil(2026, 10, 2), "distance": {"millimetersSum": "9902100"}},
            ]},
            LA,
        )
        self.assertEqual(distance, {"2026-10-02": {"meters": 9902.1}})
        self.assertEqual(
            describe(METRICS["distance"], distance["2026-10-02"]), "9.90 km  6.15 mi"
        )

    def test_daily_request_uses_civil_dates(self):
        args = request(METRICS["steps"], dt.date(2026, 10, 1), dt.date(2026, 10, 2), LA)
        self.assertEqual(
            args, ["daily-rollup", "--from", "2026-10-01", "--to", "2026-10-02"]
        )


class HourlyHeartRate(unittest.TestCase):
    def sample(self, stamp, bpm, platform="FITBIT"):
        return {
            "dataSource": {"platform": platform},
            "heartRate": {"beatsPerMinute": str(bpm), "sampleTime": {"physicalTime": stamp}},
        }

    def test_fitbit_samples_grouped_by_local_hour(self):
        rows = hours(
            {"dataPoints": [
                self.sample("2026-10-03T13:00:05Z", 50),
                self.sample("2026-10-03T13:59:59Z", 61),
                self.sample("2026-10-03T13:30:00Z", 99, "HEALTH_KIT"),
                self.sample("2026-10-03T14:00:00Z", 70),
            ]},
            LA,
        )
        self.assertEqual(
            rows,
            {
                "2026-10-03T06:00:00-07:00": {"avg": 55.5, "min": 50, "max": 61},
                "2026-10-03T07:00:00-07:00": {"avg": 70.0, "min": 70, "max": 70},
            },
        )

    def test_repeated_hour_at_end_of_daylight_time_stays_distinct(self):
        rows = hours(
            {"dataPoints": [
                self.sample("2026-11-01T08:10:00Z", 60),
                self.sample("2026-11-01T09:10:00Z", 61),
            ]},
            LA,
        )
        self.assertEqual(
            sorted(rows), ["2026-11-01T01:00:00-07:00", "2026-11-01T01:00:00-08:00"]
        )

    def test_hourly_request_lists_samples_between_local_midnights(self):
        args = request(METRICS["hr"], dt.date(2026, 10, 2), dt.date(2026, 10, 2), LA)
        field = "heart_rate.sample_time.physical_time"
        self.assertEqual(
            args[-1],
            f'{field} >= "2026-10-02T07:00:00Z" AND {field} < "2026-10-03T07:00:00Z"',
        )
        self.assertEqual(args[0], "list")


if __name__ == "__main__":
    unittest.main()
