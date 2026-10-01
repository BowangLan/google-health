"""Exercise sync through real files and an in-memory Google adapter."""

import copy
import datetime as dt
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from healthsync.cli import main
from healthsync.common import Clock, digest_fields
from healthsync.config import Config, resolve
from healthsync.google_health import GoogleHealth, RemoteError, extract_id
from healthsync.records.food import Food
from healthsync.records.weight import Weight
from healthsync.store import Store, read_entry, write_entry
from healthsync.sync import Engine


class FixedClock(Clock):
    def now(self):
        return dt.datetime(2026, 9, 24, 10, tzinfo=self.zone)


class FakeRemote:
    def __init__(self, record):
        self.record = record
        self.points = {}
        self.calls = []
        self.counter = 1000
        self.lose_id = False
        self.fail_delete = False
        self.uncertain_create = False
        self.fail_create = False

    def put(self, fm, eid="1234"):
        dp = self.record.fm_to_remote(copy.deepcopy(fm))
        dp["name"] = f"users/me/dataTypes/{self.record.api_type}/dataPoints/{eid}"
        self.points[eid] = dp
        return dp

    def fetch(self, since, until="today", limit=500):
        self.calls.append(("fetch", since))
        return [
            copy.deepcopy(dp)
            for dp in self.points.values()
            if self.record.day(self.record.remote_to_fm(dp)) >= since
        ]

    def get(self, eid):
        self.calls.append(("get", eid))
        return copy.deepcopy(self.points.get(eid))

    def create(self, payload):
        self.calls.append(("create", copy.deepcopy(payload)))
        if self.fail_create:
            raise RemoteError("rejected")
        self.counter += 1
        eid = str(self.counter)
        dp = copy.deepcopy(payload)
        dp["name"] = f"users/me/dataTypes/{self.record.api_type}/dataPoints/{eid}"
        self.points[eid] = dp
        if self.uncertain_create:
            raise RemoteError("connection lost", uncertain=True)
        return {} if self.lose_id else {"response": dp, "done": True}

    def update(self, eid, payload):
        self.calls.append(("update", eid))
        dp = copy.deepcopy(payload)
        dp["name"] = self.points[eid]["name"]
        self.points[eid] = dp
        return {"response": dp, "done": True}

    def delete(self, ids):
        self.calls.append(("delete", list(ids)))
        if self.fail_delete:
            raise RemoteError("delete rejected")
        for eid in ids:
            self.points.pop(eid, None)
        return {}


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.output = io.StringIO()
        self.redirect = redirect_stdout(self.output)
        self.redirect.__enter__()
        self.addCleanup(self.redirect.__exit__, None, None, None)
        self.engine = self.make_engine(Weight())

    def make_engine(self, record):
        directory = self.root / record.kind
        config = Config(record.kind, directory, directory / ".index.json", Path("fake"))
        return Engine(Store(config, record), FakeRemote(record), FixedClock())

    def weight(self, kg=79.4):
        return {"time": "2026-09-24T08:00:00-07:00", "weight_kg": kg}

    def food(self):
        return {
            "start": "2026-09-24T12:00:00-07:00",
            "meal": "LUNCH",
            "name": "Burrito",
            "kcal": 650,
        }

    def pull_one(self, engine=None, fm=None):
        e = engine or self.engine
        e.remote.put(fm or self.weight())
        self.assertEqual(e.pull(), 0)
        return next(iter(e.store.scan()[0].values()))

    def edit(self, path, key, value, body=None):
        fm, old_body = read_entry(path)
        fm[key] = value
        write_entry(path, fm, old_body if body is None else body)
        return fm

    def test_weight_round_trip_updates_same_id_and_preserves_private_notes(self):
        e = self.engine
        path, fm, _ = self.pull_one()
        self.edit(path, "weight_kg", 80.1, "Private context")
        self.assertEqual(e.push(), 0)
        self.assertEqual(set(e.remote.points), {"1234"})
        self.assertIn(("update", "1234"), e.remote.calls)
        self.assertEqual(e.pull(), 0)
        fm, body = read_entry(path)
        self.assertFalse(e.record.dirty(fm))
        self.assertEqual(fm["weight_kg"], 80.1)
        self.assertEqual(body.strip(), "Private context")
        self.assertEqual(e.remote.points["1234"]["weight"]["notes"], "")

    def test_food_replace_creates_before_deleting(self):
        e = self.make_engine(Food())
        path, _, _ = self.pull_one(e, self.food())
        self.edit(path, "kcal", 700)
        self.assertEqual(e.push(), 0)
        kinds = [c[0] for c in e.remote.calls]
        self.assertLess(kinds.index("create"), kinds.index("delete"))
        self.assertNotIn("1234", e.remote.points)
        self.assertEqual(e.pull(), 0)
        self.assertFalse(e.record.dirty(next(iter(e.store.scan()[0].values()))[1]))

    def test_food_zero_nutrients_round_trip_and_delete(self):
        e = self.make_engine(Food())
        fm = self.food()
        fm['nutrients'] = {'PROTEIN': 23, 'IRON': 0, 'VITAMIN_C': 0}
        e.add(fm)
        eid = next(iter(e.remote.points))
        # Google omits zero quantities on read, even if sent explicitly.
        nutrients = e.remote.points[eid]['nutritionLog']['nutrients']
        e.remote.points[eid]['nutritionLog']['nutrients'] = [
            n for n in nutrients if n['quantity']['grams'] != 0
        ]
        local = next(iter(e.store.scan()[0].values()))
        remote = e.remote_record(eid)
        self.assertEqual(e.record.digest(local[1]), e.record.digest(remote))
        self.assertEqual(e.record.diff(local[1], remote), [])
        local[0].unlink()
        self.assertEqual(e.push(yes=True), 0)
        self.assertFalse(e.remote.points)

    def test_legacy_food_zero_digest_is_clean_and_migrates_on_pull(self):
        e = self.make_engine(Food())
        fm = self.food()
        fm['nutrients'] = {'PROTEIN': 23, 'IRON': 0}
        path, fm, _ = self.pull_one(e, fm)
        fm['sync']['digest'] = digest_fields(fm, e.record.owned)
        write_entry(path, fm, 'Keep this note')
        self.assertFalse(e.record.dirty(fm))
        e.remote.points['1234']['nutritionLog']['nutrients'] = [
            {'nutrient': 'PROTEIN', 'quantity': {'grams': 23}}
        ]
        self.assertEqual(e.pull(), 0)
        updated, body = read_entry(path)
        self.assertFalse(e.record.dirty(updated))
        self.assertEqual(body.strip(), 'Keep this note')
        path.unlink()
        self.assertEqual(e.push(yes=True), 0)

    def test_zero_normalization_does_not_hide_real_food_conflicts(self):
        e = self.make_engine(Food())
        fm = self.food()
        fm['nutrients'] = {'PROTEIN': 23, 'IRON': 0}
        path, _, _ = self.pull_one(e, fm)
        e.remote.points['1234']['nutritionLog']['nutrients'] = [
            {'nutrient': 'PROTEIN', 'quantity': {'grams': 24}}
        ]
        path.unlink()
        self.assertEqual(e.push(yes=True), 1)
        self.assertIn('1234', e.remote.points)

    def test_status_does_not_claim_remote_agreement(self):
        e = self.engine
        self.pull_one()
        e.remote.put(self.weight(90))
        e.remote.calls.clear()
        self.output.truncate(0)
        self.output.seek(0)
        e.status()
        self.assertIn('1 locally unchanged', self.output.getvalue())
        self.assertNotIn('in sync', self.output.getvalue())
        self.assertEqual(e.remote.calls, [])
        with patch('sys.stdin.isatty', return_value=False):
            e.sync()
        self.assertIn('0 match Google Health, 1 differ', self.output.getvalue())

    def test_push_summary_counts_confirmed_deletions(self):
        e = self.engine
        path, _, _ = self.pull_one()
        path.unlink()
        self.assertEqual(e.push(yes=True), 0)
        self.assertIn('pushed 0 saved, 1 deleted, 0 already absent', self.output.getvalue())

    def test_push_summary_does_not_count_declined_or_failed_deletions(self):
        e = self.engine
        path, _, _ = self.pull_one()
        path.unlink()
        with patch('sys.stdin.isatty', return_value=False):
            self.assertEqual(e.push(), 1)
        self.assertIn('pushed 0 saved, 0 deleted', self.output.getvalue())
        e.remote.fail_delete = True
        self.assertEqual(e.push(yes=True), 1)
        self.assertIn('1234', e.store.load_index())
        self.assertIn('0 deleted, 0 already absent, 0 recovered, 1 held or failed',
                      self.output.getvalue())

    def test_push_summary_distinguishes_preview_and_already_absent(self):
        e = self.engine
        path, _, _ = self.pull_one()
        path.unlink()
        self.assertEqual(e.push(dry_run=True), 0)
        self.assertIn('would push 0 saved, 1 deleted', self.output.getvalue())
        self.assertIn('1234', e.remote.points)
        e.remote.points.clear()
        self.assertEqual(e.push(yes=True), 0)
        self.assertIn('pushed 0 saved, 0 deleted, 1 already absent', self.output.getvalue())

    def test_sync_reports_verified_matches_and_missing_records(self):
        e = self.engine
        self.pull_one()
        with patch('sys.stdin.isatty', return_value=False):
            e.sync()
        self.assertIn('1 match Google Health, 0 differ', self.output.getvalue())
        self.output.truncate(0)
        self.output.seek(0)
        e.remote.points.clear()
        e.remote.put(self.weight(80), '9999')
        with patch('sys.stdin.isatty', return_value=False):
            e.sync()
        self.assertIn('0 match Google Health, 0 differ, 1 missing remotely, 1 remote only',
                      self.output.getvalue())

    def test_sync_groups_changes_and_reports_each_local_edit_once(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 80)
        e.remote.put(self.weight(81), "9999")
        e.add(self.weight(82), no_push=True)
        self.output.truncate(0)
        self.output.seek(0)
        with patch("sys.stdin.isatty", return_value=False):
            self.assertEqual(e.sync(), 0)
        output = self.output.getvalue()
        self.assertIn("From Google Health · pull (1)", output)
        self.assertIn("To Google Health · push (2)", output)
        self.assertIn("80 (local) vs 79.4 (Google Health)", output)
        self.assertEqual(output.count(e.store.rel(path)), 1)
        self.assertNotIn("Needs attention", output)
        self.assertIn("No records changed", output)

    def test_sync_clean_terminal_does_not_prompt(self):
        e = self.engine
        self.pull_one()
        with patch("sys.stdin.isatty", return_value=True), patch("builtins.input") as prompt:
            self.assertEqual(e.sync(), 0)
        prompt.assert_not_called()
        self.assertIn("Nothing to sync", self.output.getvalue())

    def test_sync_preview_never_mutates_even_with_action_flags(self):
        e = self.engine
        path, _, _ = self.pull_one()
        path.unlink()
        e.add(self.weight(80), no_push=True)
        e.remote.put(self.weight(81), "9999")
        before = {p: p.read_bytes() for p in e.store.directory.rglob("*") if p.is_file()}
        remote_before = copy.deepcopy(e.remote.points)
        e.remote.calls.clear()
        with patch("sys.stdin.isatty", return_value=True), patch("builtins.input") as prompt:
            self.assertEqual(e.sync(pull=True, push=True, yes=True, dry_run=True), 0)
        prompt.assert_not_called()
        self.assertEqual(before, {p: p.read_bytes() for p in e.store.directory.rglob("*") if p.is_file()})
        self.assertEqual(e.remote.points, remote_before)
        self.assertTrue(all(c[0] in ("fetch", "get") for c in e.remote.calls))
        self.assertIn("Preview only. No records changed.", self.output.getvalue())
        self.assertIn("delete", self.output.getvalue())

    def test_sync_invalid_choice_retries_and_accepts_named_action(self):
        e = self.engine
        e.remote.put(self.weight())
        with patch("sys.stdin.isatty", return_value=True), patch(
            "builtins.input", side_effect=["typo", " PULL "]
        ) as prompt:
            self.assertEqual(e.sync(), 0)
        self.assertEqual(prompt.call_count, 2)
        self.assertIn("1234", e.store.scan()[0])
        self.assertEqual(sum(c[0] == "fetch" for c in e.remote.calls), 1)

    def test_sync_cancel_and_eof_leave_records_untouched(self):
        e = self.engine
        e.remote.put(self.weight())
        for choice in ("", "n", "cancel", EOFError()):
            with self.subTest(choice=choice), patch("sys.stdin.isatty", return_value=True), patch(
                "builtins.input", side_effect=[choice]
            ):
                self.assertEqual(e.sync(), 0)
            self.assertEqual(e.store.scan()[0], {})
            self.assertTrue(all(c[0] == "fetch" for c in e.remote.calls))

    def test_sync_both_pulls_before_push_and_retains_conflicts(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 80)
        e.remote.put(self.weight(81))
        e.remote.put(self.weight(82), "9999")
        e.add(self.weight(83), no_push=True)
        self.output.truncate(0)
        self.output.seek(0)
        with patch("sys.stdin.isatty", return_value=True), patch("builtins.input", return_value="3"):
            self.assertEqual(e.sync(), 1)
        output = self.output.getvalue()
        self.assertIn("Needs attention (1)", output)
        self.assertIn("conf", output)
        self.assertIn("Sync needs attention", output)
        self.assertLess(output.index("Pulling from"), output.index("Pushing to"))
        self.assertEqual(read_entry(path)[0]["weight_kg"], 80)
        self.assertEqual(e.remote_record("1234")["weight_kg"], 81)
        self.assertIn("9999", e.store.scan()[0])
        self.assertEqual(len(e.remote.points), 3)

    def test_sync_matching_dirty_baseline_still_offers_refresh(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 80)
        e.remote.put(self.weight(80))
        with patch("sys.stdin.isatty", return_value=True), patch("builtins.input", return_value="push") as prompt:
            self.assertEqual(e.sync(), 0)
        prompt.assert_called_once()
        self.assertIn("refresh", self.output.getvalue())
        self.assertFalse(e.record.dirty(read_entry(path)[0]))
        self.assertFalse(any(c[0] in ("create", "update") for c in e.remote.calls))

    def test_sync_preview_reports_pending_recovery_without_retrying_create(self):
        e = self.engine
        e.remote.lose_id = True
        self.assertEqual(e.add(self.weight()), 1)
        journal = e.store.journal.read_bytes()
        e.remote.calls.clear()
        self.assertEqual(e.sync(dry_run=True), 0)
        self.assertEqual(e.store.journal.read_bytes(), journal)
        self.assertIn("pull to reconcile", self.output.getvalue())
        self.assertIn("Recovery is pending", self.output.getvalue())
        self.assertTrue(all(c[0] in ("fetch", "get") for c in e.remote.calls))

    def test_partial_replacement_retries_only_cleanup(self):
        e = self.make_engine(Food())
        path, _, _ = self.pull_one(e, self.food())
        self.edit(path, "kcal", 700)
        e.remote.fail_delete = True
        self.assertEqual(e.push(), 1)
        self.assertEqual(len(e.remote.points), 2)
        self.assertTrue(e.store.operations())
        e.remote.fail_delete = False
        self.assertEqual(e.push(), 0)
        self.assertEqual(len(e.remote.points), 1)
        self.assertEqual(sum(c[0] == "create" for c in e.remote.calls), 1)
        self.assertFalse(e.store.operations())
        self.assertFalse(e.store.pending_deletes(e.store.scan()[0]))

    def test_cleanup_refuses_remote_edit_after_replacement(self):
        e = self.make_engine(Food())
        path, _, _ = self.pull_one(e, self.food())
        self.edit(path, "kcal", 700)
        e.remote.fail_delete = True
        e.push()
        e.remote.fail_delete = False
        e.remote.points["1234"]["nutritionLog"]["energy"]["kcal"] = 680
        self.assertEqual(e.push(), 1)
        self.assertEqual(len(e.remote.points), 2)

    def test_failed_food_create_keeps_original(self):
        e = self.make_engine(Food())
        path, _, _ = self.pull_one(e, self.food())
        self.edit(path, "kcal", 700)
        e.remote.fail_create = True
        self.assertEqual(e.push(), 1)
        self.assertEqual(set(e.remote.points), {"1234"})
        self.assertFalse(e.store.operations())

    def test_add_only_pushes_requested_record(self):
        e = self.engine
        e.add(self.weight(70), no_push=True)
        e.add(self.weight(71))
        self.assertEqual(len(e.remote.points), 1)
        self.assertEqual(len(e.store.scan()[1]), 1)

    def test_multiple_same_minute_records_are_preserved(self):
        e = self.engine
        e.add(self.weight(), no_push=True)
        e.add(self.weight(), no_push=True)
        self.assertEqual(len(e.store.scan()[1]), 2)
        self.assertEqual(e.push(), 0)
        self.assertEqual(len(e.remote.points), 2)

    def test_lost_id_is_recovered_without_duplicate_create(self):
        e = self.engine
        e.remote.lose_id = True
        self.assertEqual(e.add(self.weight()), 1)
        self.assertEqual(e.push(), 1)
        self.assertEqual(len(e.remote.points), 1)
        self.assertEqual(e.pull(), 0)
        self.assertFalse(e.store.operations())
        self.assertEqual(e.push(), 0)
        self.assertEqual(len(e.remote.points), 1)

    def test_uncertain_create_is_reconciled_before_retry(self):
        e = self.engine
        e.remote.uncertain_create = True
        self.assertEqual(e.add(self.weight()), 1)
        self.assertEqual(e.push(), 1)
        self.assertEqual(len(e.remote.points), 1)
        self.assertEqual(e.pull(), 0)
        self.assertEqual(len(e.store.scan()[0]), 1)

    def test_default_pull_includes_old_pending_create(self):
        e = self.engine
        fm = self.weight()
        fm['time'] = '2026-09-02T08:00:00-07:00'
        e.remote.uncertain_create = True
        self.assertEqual(e.add(fm), 1)
        self.assertEqual(e.pull(), 0)
        self.assertIn(('fetch', '2026-09-02'), e.remote.calls)
        self.assertFalse(e.store.operations())
        self.assertEqual(len(e.remote.points), 1)
        self.assertIn('widened pull to 2026-09-02 for pending recovery', self.output.getvalue())

    def test_default_pull_includes_legacy_orphans_but_not_ordinary_old_files(self):
        e = self.engine
        fm = self.weight()
        fm['time'] = '2026-09-02T08:00:00-07:00'
        e.add(fm, no_push=True)
        self.assertEqual(e.pull(), 0)
        self.assertIn(('fetch', '2026-09-18'), e.remote.calls)
        path, fm, _ = e.store.scan()[1][0]
        fm['sync'] = {'created': '2026-09-24T10:00:00-07:00'}
        write_entry(path, fm)
        e.remote.put(fm)
        self.assertEqual(e.pull(), 0)
        self.assertIn(('fetch', '2026-09-02'), e.remote.calls)
        self.assertFalse(e.store.scan()[2])

    def test_ambiguous_recovery_remains_held(self):
        e = self.engine
        e.remote.lose_id = True
        e.add(self.weight())
        e.remote.put(self.weight(), "9999")
        self.assertEqual(e.pull(), 1)
        self.assertTrue(e.store.operations())
        self.assertEqual(e.push(), 1)
        self.assertEqual(len(e.remote.points), 2)

    def test_conflict_detected_even_if_local_date_moves_outside_window(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "time", "2026-10-10T08:00:00-07:00")
        e.remote.put(self.weight(90))
        self.assertEqual(e.push(), 1)
        self.assertFalse(any(c[0] == "update" for c in e.remote.calls))
        self.assertIn(("get", "1234"), e.remote.calls)

    def test_missing_remote_is_a_conflict_and_not_recreated(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 90)
        e.remote.points.clear()
        self.assertEqual(e.push(), 1)
        self.assertFalse(e.remote.points)

    def test_local_delete_is_held_on_pull_and_confirmed_on_push(self):
        e = self.engine
        path, _, _ = self.pull_one()
        path.unlink()
        self.assertEqual(e.pull(), 0)
        self.assertFalse(path.exists())
        with patch("sys.stdin.isatty", return_value=False):
            self.assertEqual(e.push(), 1)
        self.assertIn("1234", e.remote.points)
        self.assertEqual(e.push(yes=True), 0)
        self.assertFalse(e.remote.points)
        self.assertFalse(e.store.load_index())

    def test_delete_remote_conflict_refused(self):
        e = self.engine
        path, _, _ = self.pull_one()
        path.unlink()
        e.remote.put(self.weight(90))
        self.assertEqual(e.push(yes=True), 1)
        self.assertIn("1234", e.remote.points)
        self.assertEqual(e.pull(force=True), 0)
        self.assertTrue(path.exists())

    def test_pull_retains_dirty_local_file_and_notes(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 90, "My note")
        e.remote.put(self.weight(80))
        e.pull()
        fm, body = read_entry(path)
        self.assertEqual(fm["weight_kg"], 90)
        self.assertEqual(body.strip(), "My note")
        e.pull(force=True)
        self.assertEqual(read_entry(path)[0]["weight_kg"], 80)
        self.assertEqual(read_entry(path)[1].strip(), "My note")

    def test_same_id_in_food_and_weight_is_isolated(self):
        weight = self.engine
        food = self.make_engine(Food())
        self.pull_one(weight)
        path, _, _ = self.pull_one(food, self.food())
        path.unlink()
        self.assertFalse(weight.store.pending_deletes(weight.store.scan()[0]))
        self.assertEqual(weight.push(), 0)
        self.assertIn("1234", food.remote.points)

    def test_broken_file_cannot_be_mistaken_for_deletion(self):
        e = self.engine
        path, _, _ = self.pull_one()
        path.write_text("broken YAML")
        with self.assertRaises(ValueError):
            e.push(yes=True)
        self.assertIn("1234", e.remote.points)

    def test_unreadable_index_fails_closed(self):
        e = self.engine
        self.pull_one()
        e.store.index.write_text("broken")
        with self.assertRaises(ValueError):
            e.push(yes=True)
        self.assertIn("1234", e.remote.points)

    def test_dry_run_does_not_create_local_records(self):
        self.assertEqual(self.engine.add(self.weight(), dry_run=True), 0)
        self.assertFalse(self.engine.store.directory.exists())
        self.assertFalse(self.engine.remote.calls)

    def test_dry_run_push_does_not_change_files_or_remote(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 90)
        before = {
            p: p.read_bytes() for p in e.store.directory.rglob("*") if p.is_file()
        }
        self.assertEqual(e.push(dry_run=True), 0)
        after = {p: p.read_bytes() for p in e.store.directory.rglob("*") if p.is_file()}
        self.assertEqual(before, after)
        self.assertFalse(any(c[0] == "update" for c in e.remote.calls))

    def test_weight_notes_are_remote_but_body_is_private(self):
        fm = self.weight()
        fm["remote_notes"] = "morning"
        self.engine.add(fm, "private")
        dp = next(iter(self.engine.remote.points.values()))
        self.assertEqual(dp["weight"]["notes"], "morning")
        self.assertNotIn("private", json.dumps(dp))

    def test_recovery_preserves_edits_made_after_uncertain_create(self):
        e = self.engine
        e.remote.uncertain_create = True
        e.add(self.weight())
        path = e.store.scan()[1][0][0]
        self.edit(path, "weight_kg", 81, "Edited after request")
        self.assertEqual(e.pull(), 0)
        path, fm, body = next(iter(e.store.scan()[0].values()))
        self.assertEqual(fm["weight_kg"], 81)
        self.assertTrue(e.record.dirty(fm))
        self.assertIn("Edited after request", body)
        self.assertEqual(e.push(), 0)
        self.assertEqual(len(e.remote.points), 1)

    def test_renamed_uncertain_create_is_not_replayed(self):
        e = self.engine
        e.remote.uncertain_create = True
        e.add(self.weight())
        path = e.store.scan()[1][0][0]
        path.rename(path.with_name("renamed.md"))
        self.assertEqual(e.push(), 1)
        self.assertEqual(sum(c[0] == "create" for c in e.remote.calls), 1)

    def test_missing_pending_file_is_reported_before_recovery_reads_or_writes(self):
        e = self.engine
        e.remote.uncertain_create = True
        e.add(self.weight())
        path = e.store.scan()[1][0][0]
        staged = self.root / 'staged.md'
        path.rename(staged)
        journal = e.store.journal.read_bytes()
        e.remote.calls.clear()
        for command in (e.pull, e.push, e.sync):
            self.assertEqual(command(), 1)
            self.assertEqual(e.remote.calls, [])
            self.assertEqual(e.store.journal.read_bytes(), journal)
        self.assertIn('pending operation file is missing', self.output.getvalue())
        self.assertIn(str(path), self.output.getvalue())
        self.assertIn('move it back or restore it from backup', self.output.getvalue())
        staged.rename(path)
        self.assertEqual(e.pull(), 0)
        self.assertFalse(e.store.operations())
        self.assertEqual(len(e.remote.points), 1)

    def test_missing_cleanup_file_blocks_remote_deletion(self):
        e = self.make_engine(Food())
        path, _, _ = self.pull_one(e, self.food())
        self.edit(path, 'kcal', 700)
        e.remote.fail_delete = True
        self.assertEqual(e.push(), 1)
        op = next(iter(e.store.operations().values()))
        (e.store.directory / op['path']).rename(self.root / 'staged.md')
        e.remote.fail_delete = False
        e.remote.calls.clear()
        self.assertEqual(e.push(), 1)
        self.assertEqual(e.remote.calls, [])
        self.assertEqual(len(e.remote.points), 2)

    def test_crash_after_response_before_commit_is_recovered(self):
        e = self.engine
        with (
            patch.object(e, "_commit", side_effect=OSError("disk unavailable")),
            self.assertRaises(OSError),
        ):
            e.add(self.weight())
        self.assertEqual(len(e.remote.points), 1)
        self.assertTrue(e.store.operations())
        self.assertEqual(e.pull(), 0)
        self.assertEqual(len(e.store.scan()[0]), 1)
        self.assertEqual(sum(c[0] == "create" for c in e.remote.calls), 1)

    def test_pending_patch_is_reconciled_without_replay(self):
        e = self.engine
        path, _, _ = self.pull_one()
        self.edit(path, "weight_kg", 82)
        with (
            patch.object(e, "_commit", side_effect=OSError("disk unavailable")),
            self.assertRaises(OSError),
        ):
            e.push()
        self.assertEqual(e.pull(), 0)
        self.assertEqual(sum(c[0] == "update" for c in e.remote.calls), 1)
        self.assertFalse(e.record.dirty(read_entry(path)[0]))

    def test_duplicate_local_id_stops_remote_mutations(self):
        e = self.engine
        path, fm, body = self.pull_one()
        write_entry(path.with_name("duplicate.md"), fm, body)
        with self.assertRaises(ValueError):
            e.push(yes=True)
        self.assertFalse(
            any(c[0] in ("create", "update", "delete") for c in e.remote.calls)
        )

    def test_whole_collection_can_move_with_its_index(self):
        e = self.engine
        self.pull_one()
        old = e.store.directory
        new = old.with_name("relocated")
        old.rename(new)
        config = Config("weight", new, new / ".index.json", Path("fake"))
        store = Store(config, Weight())
        self.assertIn("1234", store.load_index())
        store.save_index(store.scan()[0])
        self.assertEqual(json.loads(store.index.read_text())["directory"], str(new))

    def test_shared_external_index_refuses_different_directory(self):
        e = self.engine
        self.pull_one()
        config = Config("weight", self.root / "empty", e.store.index, Path("fake"))
        with self.assertRaises(ValueError):
            Store(config, Weight()).load_index()

    def test_legacy_food_index_retains_baseline_and_tombstones(self):
        e = self.make_engine(Food())
        path, fm, _ = self.pull_one(e, self.food())
        e.store.index.write_text(
            json.dumps(
                {
                    "entries": {
                        "1234": {
                            "name": fm["name"],
                            "start": fm["start"],
                            "path": e.store.rel(path),
                            "kcal": 650,
                        },
                        "old-deletion": {
                            "name": "Deleted meal",
                            "start": fm["start"],
                            "path": "deleted.md",
                            "kcal": 100,
                        },
                    }
                }
            )
        )
        e.store.save_index(e.store.scan()[0])
        data = e.store.load_index()
        self.assertEqual(data["1234"]["digest"], fm["sync"]["digest"])
        self.assertIn("old-deletion", e.store.pending_deletes(e.store.scan()[0]))

    def test_deleted_record_moved_remotely_is_not_forgotten(self):
        e = self.engine
        path, _, _ = self.pull_one()
        path.unlink()
        fm = self.weight()
        fm["time"] = "2026-01-01T08:00:00-08:00"
        e.remote.put(fm)
        e.pull()
        self.assertIn("1234", e.store.pending_deletes(e.store.scan()[0]))
        self.assertEqual(e.push(yes=True), 1)

    def test_sync_reuses_fetched_snapshot_when_pulling(self):
        e = self.engine
        e.remote.put(self.weight())
        self.assertEqual(e.sync(pull=True), 0)
        self.assertEqual(sum(c[0] == "fetch" for c in e.remote.calls), 1)

    def test_legacy_unlocated_index_is_not_adopted_by_empty_folder(self):
        (self.root / ".fsync-index.json").write_text(
            json.dumps({"entries": {"1234": {"path": "meal.md"}}})
        )
        config = Config(
            "food",
            self.root / "empty-food",
            self.root / "empty-food/.fsync-index.json",
            Path("fake"),
        )
        with self.assertRaises(ValueError):
            Store(config, Food()).load_index()

    def test_remote_metadata_does_not_make_weight_dirty(self):
        e = self.engine
        path, fm, _ = self.pull_one()
        fm["source"] = "FITBIT"
        fm["sync"]["pulled"] = "different"
        write_entry(path, fm)
        self.assertFalse(e.record.dirty(fm))

    def test_two_local_pending_records_cannot_claim_one_remote_record(self):
        e = self.engine
        e.remote.uncertain_create = True
        e.add(self.weight())
        e.add(self.weight())
        e.remote.points.pop("1002")
        self.assertEqual(e.pull(), 1)
        self.assertEqual(len(e.store.operations()), 2)
        self.assertEqual(len(e.store.scan()[1]), 2)
        self.assertEqual(len(e.remote.points), 1)

    def test_legacy_parent_index_migrates_only_with_matching_local_record(self):
        e = self.make_engine(Food())
        path, fm, _ = self.pull_one(e, self.food())
        e.store.index.unlink()
        e.store.index = e.store.directory / ".fsync-index.json"
        legacy = e.store.directory.parent / ".fsync-index.json"
        legacy.write_text(
            json.dumps(
                {
                    "entries": {
                        "1234": {
                            "name": fm["name"],
                            "start": fm["start"],
                            "path": e.store.rel(path),
                        }
                    }
                }
            )
        )
        self.assertIn("1234", e.store.load_index())
        self.assertTrue(legacy.exists())
        e.store.save_index(e.store.scan()[0])
        self.assertFalse(legacy.exists())
        self.assertTrue(legacy.with_name(".fsync-index.migrated.json").exists())
        self.assertIn("1234", e.store.load_index())

    def test_custom_indexes_do_not_share_recovery_journals(self):
        first = self.engine
        first.store.index = self.root / "first-index.json"
        first.remote.uncertain_create = True
        first.add(self.weight())
        config = Config(
            "weight",
            self.root / "other-weight",
            self.root / "second-index.json",
            Path("fake"),
        )
        second = Store(config, Weight())
        self.assertNotEqual(first.store.journal, second.journal)
        self.assertFalse(second.operations())
        self.assertTrue(first.store.operations())

    def test_frontmatter_delimiters_inside_values_and_body_are_preserved(self):
        e = self.engine
        fm = self.weight()
        fm["remote_notes"] = "morning---before breakfast"
        body = "Local notes\n---\nMore notes"
        e.add(fm, body, no_push=True)
        _, result, result_body = e.store.scan()[1][0]
        self.assertEqual(result["remote_notes"], fm["remote_notes"])
        self.assertEqual(result_body.strip(), body)

    def test_weight_timestamp_precision_survives_file_and_patch_round_trip(self):
        e = self.engine
        fm = self.weight()
        fm["time"] = "2026-09-24T08:00:00.123456789-07:00"
        path, pulled, _ = self.pull_one(e, fm)
        self.assertEqual(pulled["time"], fm["time"])
        self.edit(path, "weight_kg", 80)
        self.assertEqual(e.push(), 0)
        self.assertEqual(
            e.remote.points["1234"]["weight"]["sampleTime"]["physicalTime"],
            "2026-09-24T15:00:00.123456789Z",
        )
        self.assertEqual(e.pull(), 0)
        self.assertFalse(e.record.dirty(read_entry(path)[0]))

    def test_subsecond_remote_change_is_a_conflict(self):
        e = self.engine
        fm = self.weight()
        fm["time"] = "2026-09-24T08:00:00.123456-07:00"
        path, _, _ = self.pull_one(e, fm)
        self.edit(path, "weight_kg", 80)
        fm["time"] = "2026-09-24T08:00:00.654321-07:00"
        e.remote.put(fm)
        self.assertEqual(e.push(), 1)
        self.assertFalse(any(call[0] == "update" for call in e.remote.calls))


class CliTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.config = self.root / "hsync.toml"
        self.config.write_text(
            'food_dir = "food"\nweight_dir = "weight"\nweight_unit = "lb"\n'
        )
        self.output = io.StringIO()
        self.redirect = redirect_stdout(self.output)
        self.redirect.__enter__()
        self.addCleanup(self.redirect.__exit__, None, None, None)

    def test_sync_preview_flags_work_for_collection_and_aggregate(self):
        for args, calls in (
            (["food", "sync", "-n"], 1),
            (["weight", "sync", "--dry-run", "--pull", "--push"], 1),
            (["sync", "--all", "-n"], 2),
        ):
            with self.subTest(args=args), patch.object(Engine, "sync", return_value=0) as sync:
                self.assertEqual(main(args + ["--config", str(self.config)]), 0)
                self.assertEqual(sync.call_count, calls)
                self.assertTrue(all(call.args[-1] for call in sync.call_args_list))

    def test_weight_add_pounds_and_past_date_noon(self):
        self.assertEqual(
            main(
                [
                    "weight",
                    "--config",
                    str(self.config),
                    "add",
                    "175",
                    "--date",
                    "2026-01-15",
                    "--no-push",
                ]
            ),
            0,
        )
        path = next((self.root / "weight").rglob("*.md"))
        fm, body = read_entry(path)
        self.assertAlmostEqual(fm["weight_kg"], 79.37866475)
        self.assertEqual(fm["time"], "2026-01-15T12:00:00-08:00")
        self.assertIn("placeholder", body)

    def test_explicit_time_and_sodium(self):
        self.assertEqual(
            main(
                [
                    "food",
                    "add",
                    "anytime",
                    "Soup",
                    "100",
                    "--date",
                    "2026-09-20",
                    "--at",
                    "08:15",
                    "--sodium-mg",
                    "480",
                    "--no-push",
                    "--config",
                    str(self.config),
                ]
            ),
            0,
        )
        fm, _ = read_entry(next((self.root / "food").rglob("*.md")))
        self.assertEqual(fm["nutrients"]["SODIUM"], 0.48)
        self.assertEqual(fm["start"], "2026-09-20T08:15:00-07:00")

    def test_aggregate_requires_all(self):
        with self.assertRaises(SystemExit) as exc:
            main(["status", "--config", str(self.config)])
        self.assertEqual(exc.exception.code, 2)
        self.assertEqual(main(["status", "--all", "--config", str(self.config)]), 0)

    def test_separate_non_nested_directories_required(self):
        self.config.write_text('food_dir = "same"\nweight_dir = "same/nested"\n')
        with self.assertRaises(ValueError):
            resolve(SimpleNamespace(config=str(self.config)), "weight")

    def test_legacy_index_does_not_apply_to_weight(self):
        self.config.write_text(
            'index = "custom-food-index.json"\nfood_dir = "food"\nweight_dir = "weight"\n'
        )
        args = SimpleNamespace(config=str(self.config))
        self.assertEqual(
            resolve(args, "food").index, self.root / "custom-food-index.json"
        )
        self.assertEqual(
            resolve(args, "weight").index, self.root / "weight/.hsync-index.json"
        )


class TransportTests(unittest.TestCase):
    def test_operation_name_is_not_a_record_id(self):
        self.assertEqual(extract_id({"name": "operations/abcd"}), "")
        self.assertEqual(
            extract_id(
                {
                    "name": "operations/abcd",
                    "response": {"name": "users/me/dataTypes/weight/dataPoints/1234"},
                }
            ),
            "1234",
        )

    def test_all_pages_are_read(self):
        remote = GoogleHealth(Path("fake"), Weight())
        pages = [
            SimpleNamespace(
                returncode=0,
                stdout=json.dumps(
                    {"dataPoints": [{"name": "one"}], "nextPageToken": "next"}
                ),
            ),
            SimpleNamespace(
                returncode=0, stdout=json.dumps({"dataPoints": [{"name": "two"}]})
            ),
        ]
        with patch("healthsync.google_health.subprocess.run", side_effect=pages) as run:
            self.assertEqual(len(remote.fetch("2026-09-20")), 2)
        self.assertIn("--page-token", run.call_args_list[1].args[0])

    def test_partial_listing_is_never_returned(self):
        remote = GoogleHealth(Path("fake"), Weight())
        page = SimpleNamespace(
            returncode=0,
            stdout=json.dumps({"dataPoints": [], "nextPageToken": "repeat"}),
        )
        with (
            patch("healthsync.google_health.subprocess.run", return_value=page),
            self.assertRaises(RemoteError),
        ):
            remote.fetch("2026-09-20")

    def test_weight_filter_uses_utc_and_food_filter_uses_civil_dates(self):
        page = SimpleNamespace(returncode=0, stdout='{"dataPoints": []}')
        with patch("healthsync.google_health.subprocess.run", return_value=page) as run:
            GoogleHealth(Path("fake"), Weight()).fetch("2026-01-15", "2026-01-15")
            args = run.call_args.args[0]
            query = args[args.index("--filter") + 1]
            self.assertIn(
                'weight.sample_time.physical_time >= "2026-01-15T08:00:00Z"', query
            )
            self.assertIn('< "2026-01-16T08:00:00Z"', query)
            GoogleHealth(Path("fake"), Food()).fetch("2026-01-15", "2026-01-15")
            args = run.call_args.args[0]
            query = args[args.index("--filter") + 1]
            self.assertIn(
                'nutrition_log.interval.civil_start_time >= "2026-01-15"', query
            )

    def test_pending_operation_does_not_count_as_success(self):
        remote = GoogleHealth(Path("fake"), Weight())
        with self.assertRaises(RemoteError) as exc:
            remote.finish({"name": "users/me/operations/1234", "done": False})
        self.assertTrue(exc.exception.uncertain)


class RecordValidationTests(unittest.TestCase):
    def test_nonfinite_and_out_of_range_weights_rejected(self):
        record = Weight()
        for val in (float("nan"), float("inf"), -1, 1001, True):
            with self.subTest(val=val), self.assertRaises((ValueError, TypeError)):
                record.validate({"time": "2026-09-24T08:00:00-07:00", "weight_kg": val})

    def test_pound_conversion_has_stable_round_trip(self):
        record = Weight()
        fm = {"time": "2026-09-24T08:00:00-07:00", "weight_kg": 175 * 0.45359237}
        record.validate(fm)
        digest = record.digest(fm)
        for _ in range(10):
            dp = record.fm_to_remote(fm)
            dp["name"] = "users/me/dataTypes/weight/dataPoints/1234"
            fm = record.remote_to_fm(dp)
            self.assertEqual(record.digest(fm), digest)

    def test_invalid_or_nonexistent_local_time_rejected(self):
        clock = FixedClock()
        for date, time in (
            ("2026-09-24", "25:00"),
            ("2026-09-24", "08:15:30"),
            ("2026-03-08", "02:30"),
        ):
            with self.subTest(date=date, time=time), self.assertRaises(ValueError):
                clock.entry_time(date, time)
        self.assertEqual(
            clock.entry_time("2026-09-24", "8:15")[0], "2026-09-24T08:15:00-07:00"
        )


if __name__ == "__main__":
    unittest.main()
