"""The web app's sync report is parsed from what the real engine prints."""

import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from healthsync.config import Config
from healthsync.records.food import Food
from healthsync.records.weight import Weight
from healthsync.store import Store, read_entry, write_entry
from healthsync.sync import Engine
from healthsync.sync_report import parse
from test_sync import FakeRemote, FixedClock


class SyncReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.engine = self.make_engine(Weight())

    def make_engine(self, record):
        directory = self.root / record.kind
        config = Config(record.kind, directory, directory / ".index.json", Path("fake"))
        return Engine(Store(config, record), FakeRemote(record), FixedClock())

    def weight(self, kg=79.4, time="2026-09-24T08:00:00-07:00"):
        return {"time": time, "weight_kg": kg}

    def run_sync(self, engine=None, **options):
        """The output and exit code of one non-interactive sync run."""
        out = io.StringIO()
        with redirect_stdout(out), patch("sys.stdin.isatty", return_value=False):
            code = (engine or self.engine).sync(**options)
        return out.getvalue(), code

    def pull_one(self):
        e = self.engine
        e.remote.put(self.weight())
        with redirect_stdout(io.StringIO()):
            self.assertEqual(e.pull(), 0)
        return next(iter(e.store.scan()[0].values()))

    def edit(self, path, key, value):
        fm, body = read_entry(path)
        fm[key] = value
        write_entry(path, fm, body)

    def test_clean_comparison_has_range_counts_and_nothing_to_do(self):
        self.pull_one()
        output, code = self.run_sync()
        report = parse(output, "", code, kinds=("weight",))
        self.assertEqual(code, 0)
        self.assertIsNone(report["error"])
        [weight] = report["collections"]
        self.assertEqual(weight["kind"], "weight")
        self.assertTrue(weight["checked"])
        self.assertEqual((weight["since"], weight["until"]), ("2026-09-24", "2026-09-24"))
        self.assertEqual(
            weight["comparison"],
            {"matched": 1, "different": 0, "missing": 0, "remote_only": 0},
        )
        for key in ("incoming", "outgoing", "attention", "events", "deletions", "ran"):
            self.assertEqual(weight[key], [], key)
        self.assertIsNone(weight["pull"])
        self.assertIsNone(weight["push"])
        self.assertIn("Everything matches in the checked range. Nothing to sync.", weight["notes"])

    def test_rows_are_grouped_by_direction_with_field_differences(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 80)
        e.remote.put(self.weight(81, "2026-09-24T07:00:00-07:00"), "9999")
        with redirect_stdout(io.StringIO()):
            e.add(self.weight(82, "2026-09-24T09:00:00-07:00"), no_push=True)
        output, code = self.run_sync()
        [weight] = parse(output, "", code, kinds=("weight",))["collections"]

        [incoming] = weight["incoming"]
        self.assertEqual(incoming["tag"], "new")
        self.assertEqual(incoming["time"], "2026-09-24T07:00:00-07:00")
        self.assertEqual(incoming["detail"], "81 kg")
        self.assertEqual(incoming["phase"], "compare")

        edited, new = weight["outgoing"]
        self.assertEqual(edited["tag"], "edit")
        self.assertEqual(edited["path"], e.store.rel(path))
        self.assertEqual(edited["detail"], "")
        self.assertEqual(
            edited["diff"], [{"field": "weight_kg", "local": "80", "remote": "79.4"}]
        )
        self.assertEqual(new["tag"], "new")
        self.assertTrue(new["path"].endswith(".md"))
        self.assertEqual(new["detail"], "82 kg")
        self.assertEqual(weight["attention"], [])
        self.assertEqual(
            weight["comparison"],
            {"matched": 0, "different": 1, "missing": 0, "remote_only": 1},
        )

    def test_pull_and_push_phases_carry_their_summaries_and_events(self):
        e = self.engine
        e.remote.put(self.weight(81, "2026-09-24T07:00:00-07:00"), "9999")
        with redirect_stdout(io.StringIO()):
            e.add(self.weight(82, "2026-09-24T09:00:00-07:00"), no_push=True)
        output, code = self.run_sync(pull=True, push=True)
        self.assertEqual(code, 0)
        [weight] = parse(output, "", code, kinds=("weight",))["collections"]
        self.assertEqual(weight["ran"], ["pull", "push"])
        self.assertEqual(weight["pull"], {"fetched": 1, "saved": 1, "removed": 0, "held": 0})
        self.assertEqual(
            weight["push"],
            {"saved": 1, "deleted": 0, "absent": 0, "recovered": 0, "failed": 0},
        )
        self.assertFalse(weight["dry_run"])
        [pushed] = [row for row in weight["events"] if row["phase"] == "push"]
        self.assertEqual(pushed["tag"], "ok")
        self.assertTrue(pushed["path"].endswith(".md"))
        self.assertEqual(pushed["detail"], "create")
        self.assertIn("Selected sync actions completed.", weight["notes"])

    def test_pull_keeps_local_edits_and_reports_them_as_held(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 80)
        e.remote.put(self.weight(81))
        output, code = self.run_sync(pull=True)
        [weight] = parse(output, "", code, kinds=("weight",))["collections"]
        self.assertEqual(weight["pull"], {"fetched": 1, "saved": 0, "removed": 0, "held": 1})
        [held] = [row for row in weight["events"] if row["phase"] == "pull"]
        self.assertEqual(held["tag"], "held")
        self.assertEqual(held["path"], e.store.rel(path))
        self.assertEqual(held["detail"], "locally modified")
        # The comparison already called it a conflict; the pull did not resolve it.
        [conflict] = weight["attention"]
        self.assertEqual(conflict["tag"], "conf")
        self.assertEqual(conflict["diff"], [{"field": "weight_kg", "local": "80", "remote": "81"}])

    def test_deletions_are_listed_and_held_until_confirmed(self):
        e = self.engine
        path, _, _ = self.pull_one()
        path.unlink()
        output, code = self.run_sync(push=True)
        self.assertEqual(code, 1)
        [weight] = parse(output, "", code, kinds=("weight",))["collections"]
        [planned] = weight["outgoing"]
        self.assertEqual(planned["tag"], "delete")
        [deletion] = weight["deletions"]
        self.assertEqual(deletion["tag"], "del")
        self.assertEqual(deletion["time"], "2026-09-24T08:00:00-07:00")
        self.assertEqual(deletion["detail"], "79.4 kg")
        self.assertTrue(weight["deletions_held"])
        self.assertEqual(weight["push"]["deleted"], 0)
        self.assertEqual(weight["push"]["failed"], 1)
        self.assertIsNone(weight["error"])

        output, code = self.run_sync(push=True, yes=True)
        self.assertEqual(code, 0)
        [weight] = parse(output, "", code, kinds=("weight",))["collections"]
        self.assertEqual(len(weight["deletions"]), 1)
        self.assertFalse(weight["deletions_held"])
        self.assertEqual(weight["push"]["deleted"], 1)
        self.assertEqual(e.remote.points, {})

    def test_conflicting_push_keeps_both_sides_and_shows_the_fields(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 80)
        e.remote.put(self.weight(81))
        output, code = self.run_sync(push=True)
        self.assertEqual(code, 1)
        [weight] = parse(output, "", code, kinds=("weight",))["collections"]
        [conflict] = [row for row in weight["events"] if row["tag"] == "conf"]
        self.assertEqual(conflict["phase"], "push")
        self.assertEqual(conflict["path"], e.store.rel(path))
        self.assertEqual(conflict["detail"], "changed here and in Google Health")
        self.assertEqual(conflict["diff"], [{"field": "weight_kg", "local": "80", "remote": "81"}])
        self.assertEqual(weight["push"]["failed"], 1)
        self.assertEqual(read_entry(path)[0]["weight_kg"], 80)
        self.assertEqual(e.remote_record("1234")["weight_kg"], 81)

    def test_pending_recovery_is_attention_without_touching_the_journal(self):
        e = self.engine
        e.remote.lose_id = True
        with redirect_stdout(io.StringIO()):
            self.assertEqual(e.add(self.weight()), 1)
        output, code = self.run_sync()
        [weight] = parse(output, "", code, kinds=("weight",))["collections"]
        tags = [row["tag"] for row in weight["attention"]]
        self.assertIn("recover", tags)
        self.assertTrue(any("pull to reconcile" in row["text"] for row in weight["attention"]))
        self.assertIn("Recovery is pending. Keep the local files and recovery journal.", weight["notes"])

    def test_aggregate_output_splits_collections_and_marks_the_unchecked_one(self):
        food = self.make_engine(Food())
        food.remote.put(
            {"start": "2026-09-24T12:00:00-07:00", "meal": "LUNCH", "name": "Burrito", "kcal": 650},
            "77",
        )
        output, code = self.run_sync(food)
        stderr = "hsync: could not read credentials; run ghealth auth login\n"
        report = parse("\nfood:\n" + output + "\nweight:\n", stderr, 1)
        self.assertEqual(report["error"], "could not read credentials; run ghealth auth login")
        food_report, weight_report = report["collections"]
        self.assertEqual(food_report["kind"], "food")
        self.assertTrue(food_report["checked"])
        [incoming] = food_report["incoming"]
        self.assertEqual(incoming["time"], "2026-09-24T12:00:00-07:00")
        self.assertEqual(incoming["detail"], "Burrito · 650 kcal")
        self.assertEqual(weight_report["kind"], "weight")
        self.assertFalse(weight_report["checked"])
        self.assertEqual(weight_report["error"], report["error"])

    def test_missing_collection_is_filled_in_when_the_run_died_early(self):
        report = parse("", "hsync: another command is using /x\n", 1)
        self.assertEqual([c["kind"] for c in report["collections"]], ["food", "weight"])
        self.assertFalse(any(c["checked"] for c in report["collections"]))
        self.assertEqual(report["error"], "another command is using /x")
        self.assertEqual(parse("", "", None)["code"], None)

    def test_unknown_lines_are_kept_as_notes(self):
        report = parse("weight sync · Checking Google Health (a through b)…\nsomething new\n", "", 0, kinds=("weight",))
        [weight] = report["collections"]
        self.assertEqual(weight["notes"], ["something new"])
        self.assertEqual(weight["events"], [])


if __name__ == "__main__":
    unittest.main()
