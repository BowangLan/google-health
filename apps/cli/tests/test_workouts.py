"""Workout sessions and run distance parsed from payloads shaped like live API responses."""

import datetime as dt
import unittest
from zoneinfo import ZoneInfo

from healthsync.workouts import merge, run_days, session

LA = ZoneInfo("America/Los_Angeles")


def point(id, kind, start, mm, platform="FITBIT"):
    return {
        "name": f"users/1/dataTypes/exercise/dataPoints/{id}",
        "dataSource": {"platform": platform, "device": {"displayName": "Google Fitbit Air"}},
        "exercise": {
            "exerciseType": kind,
            "displayName": kind.title(),
            "activeDuration": "2063.776s",
            "interval": {"startTime": start, "endTime": start},
            "metricsSummary": {"distanceMillimeters": mm, "caloriesKcal": 533},
        },
    }


class Sessions(unittest.TestCase):
    def test_fitbit_session_fields_in_local_time(self):
        key, fields = session(point(7, "RUNNING", "2026-10-03T06:16:09Z", 5779633), LA)
        self.assertEqual(key, "7")
        self.assertEqual(fields["start"], "2026-10-02T23:16:09-07:00")
        self.assertEqual(fields["distance_m"], 5779.6)
        self.assertEqual(fields["active_s"], 2064)

    def test_apple_watch_sessions_are_skipped(self):
        self.assertIsNone(
            session(point(8, "RUNNING", "2026-09-27T04:08:16Z", 2038992, "HEALTH_KIT"), LA)
        )

    def test_run_distance_counts_runs_and_treadmill_only(self):
        saved = dict(
            session(p, LA)
            for p in (
                point(1, "RUNNING", "2026-09-29T03:25:33Z", 168469),
                point(2, "TREADMILL", "2026-09-29T03:28:08Z", 3669375),
                point(3, "WALKING", "2026-09-29T04:00:00Z", 1000000),
            )
        )
        self.assertEqual(run_days(saved), {"2026-09-28": {"meters": 3837.9, "runs": 2}})


class Mirror(unittest.TestCase):
    def test_window_is_mirrored_and_older_sessions_kept(self):
        stored = {
            "old": {"start": "2026-09-01T08:00:00-07:00"},
            "gone": {"start": "2026-10-01T08:00:00-07:00"},
            "same": {"start": "2026-10-02T08:00:00-07:00", "fetched": "earlier"},
        }
        fetched = {
            "same": {"start": "2026-10-02T08:00:00-07:00"},
            "new": {"start": "2026-10-03T08:00:00-07:00"},
        }
        counts = merge(stored, fetched, dt.date(2026, 9, 27), dt.date(2026, 10, 3), "now")
        self.assertEqual(counts, (1, 0, 1))
        self.assertEqual(sorted(stored), ["new", "old", "same"])


if __name__ == "__main__":
    unittest.main()
