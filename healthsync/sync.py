"""Shared synchronization policy for editable files and Google records.

A mutation is journaled before sending it. Unknown create outcomes are only
reconciled by reading; they are never blindly retried.
"""

from __future__ import annotations

import copy
import datetime as dt
import json
import sys
from collections import Counter

from healthsync import style as S
from healthsync.common import Clock
from healthsync.google_health import RemoteError, extract_id
from healthsync.store import read_entry, write_entry


class Engine:
    def __init__(self, store, remote, clock=None):
        self.store, self.remote, self.record = store, remote, store.record
        self.clock = clock or Clock()

    def scan(self):
        result = self.store.scan()
        if result[3]:
            for path, error in result[3]:
                print(f"  {S.bad('bad')}{self.store.rel(path)}: {S.dim(error)}")
            raise ValueError("fix unreadable or duplicate records before syncing")
        return result[:3]

    def stamp(self, fm):
        fm["sync"] = {
            "pulled": self.clock.now().isoformat(),
            "digest": self.record.digest(fm),
        }

    def remote_record(self, eid):
        dp = self.remote.get(eid)
        return self.record.remote_to_fm(dp) if dp else None

    def conflicts(self, fm, remote):
        if remote is None:
            return True
        return not self.record.matches_digest(
            remote, (fm.get("sync") or {}).get("digest")
        ) and self.record.digest(fm) != self.record.digest(remote)

    def show_conflict(self, path, fm, remote):
        print(
            f"  {S.bad('conf')}{self.store.rel(path)}: "
            + S.dim(
                "record was deleted remotely"
                if remote is None
                else "changed here and in Google Health"
            )
        )
        if remote:
            for key, mine, theirs in self.record.diff(fm, remote):
                print(S.dim(f"         {key}: {mine} (here) vs {theirs} (remote)"))

    def _commit(self, key, op, keep=False):
        """Persist an acknowledged result; preserve edits made during recovery."""
        path = self.store.directory / op["path"]
        if not path.exists():
            # A crash may have happened after relocation but before clearing
            # the journal. Look for the acknowledged id before giving up.
            found = self.scan()[0].get(op.get("new_id"))
            if not found:
                raise ValueError(
                    f"restore {op['path']} before recovering this operation"
                )
            path = found[0]
        current, body = read_entry(path)
        fm = copy.deepcopy(op["fm"])
        if not self.record.matches_digest(current, op["input_digest"]):
            fm = current
        fm["id"] = op["new_id"]
        fm["sync"] = {
            "pulled": self.clock.now().isoformat(),
            "digest": self.record.digest(op["fm"]),
        }
        write_entry(path, fm, body)
        dest = self.store.relocate(path, fm)
        self.store.save_index(
            self.scan()[0], drop=[op["old_id"]] if op.get("old_id") else []
        )
        if keep:
            op.update(path=self.store.rel(dest), state="cleanup")
            self.store.operation(key, op)
        else:
            self.store.operation(key, None)
        return dest

    def _cleanup(self, key, op):
        """Finish a food replacement without recreating its new half."""
        old = self.remote_record(op["old_id"])
        if old is not None:
            if not self.record.matches_digest(old, op.get("old_digest")):
                print(
                    f"  {S.bad('conf')}replacement cleanup: old id {op['old_id']} changed; "
                    f"resolve it before retrying"
                )
                return False
            self.remote.delete([op["old_id"]])
        self._commit(key, op)
        return True

    def push_one(self, path, fm, body, dry_run=False, force=False):
        record = self.record
        original = copy.deepcopy(fm)
        record.validate(fm)
        payload = record.fm_to_remote(fm)
        action = "create" if not fm.get("id") else record.update_strategy
        old = None
        if fm.get("id"):
            # Lookup by identity, never by the locally edited date.
            old = self.remote_record(fm["id"])
            if old is None or (self.conflicts(original, old) and not force):
                self.show_conflict(path, original, old)
                return False
            if record.digest(fm) == record.digest(old):
                if not dry_run:
                    self.stamp(fm)
                    write_entry(path, fm, body)
                    self.store.relocate(path, fm)
                    self.store.save_index(self.scan()[0])
                return True
        if dry_run:
            print(
                f"  {S.note(action, 7)}{self.store.rel(path)}  "
                f"{S.dim(json.dumps(payload))}"
            )
            return True
        key = self.store.rel(path)
        if key in self.store.operations():
            print(
                f"  {S.warn('hold')}{key}: {S.dim('pending operation; run pull to reconcile')}"
            )
            return False
        op = {
            "action": action,
            "state": "requested",
            "path": key,
            "fm": copy.deepcopy(fm),
            "input_digest": record.digest(original),
            "created": self.clock.now().isoformat(),
        }
        if fm.get("id"):
            op.update(old_id=fm["id"], old_digest=record.digest(old))
        self.store.operation(key, op)
        try:
            response = (
                self.remote.update(fm["id"], payload)
                if action == "patch"
                else self.remote.create(payload)
            )
        except RemoteError as exc:
            if not exc.uncertain:
                self.store.operation(key, None)
            print(f"  {S.bad('FAIL')}{key}: {S.dim(exc)}")
            return False
        new_id = fm["id"] if action == "patch" else extract_id(response)
        op.update(response=response, new_id=new_id, state="acknowledged")
        self.store.operation(key, op)
        if not new_id:
            if action == "create":
                fm["sync"] = {"created": op["created"]}
                write_entry(path, fm, body)
            print(
                f"  {S.warn('hold')}{key}: "
                f"{S.dim('created but no id returned; run pull before retrying')}"
            )
            return False
        dest = self._commit(key, op, keep=action == "replace")
        if action == "replace":
            op = self.store.operations()[key]
            try:
                if not self._cleanup(key, op):
                    return False
            except RemoteError as exc:
                print(
                    f"  {S.bad('part')}replacement saved; "
                    f"old id {op['old_id']} needs cleanup: {S.dim(exc)}"
                )
                return False
        print(f"  {S.ok()}{self.store.rel(dest)} {S.dim(action)}")
        return True

    def add(self, fm, body="", no_push=False, dry_run=False):
        self.record.validate(fm)
        path = self.store.entry_path(fm)
        if dry_run:
            print(json.dumps(self.record.fm_to_remote(fm), indent=2))
            return 0
        self.scan()
        self.store.load_index()
        if path.exists():
            # Multiple measurements or identical meals within a minute remain
            # separate until Google assigns their identities.
            stem = path.stem
            i = 2
            while path.exists():
                path = path.with_name(f"{stem}--{i}.md")
                i += 1
        write_entry(path, fm, body)
        print(f"  {S.ok('new')}{self.store.rel(path)}")
        if no_push:
            return 0
        return 0 if self.push_one(path, fm, body) else 1

    def recover(self, points):
        records = [self.record.remote_to_fm(dp) for dp in points]
        claimed = set(self.scan()[0])
        operations = self.store.operations()
        active_paths = {op["path"] for op in operations.values()}
        pending_matches = Counter(
            self.record.match_key(op["fm"])
            for op in operations.values()
            if op["action"] != "patch" and not op.get("new_id")
        )
        pending_matches.update(
            self.record.match_key(fm)
            for path, fm, _ in self.scan()[2]
            if self.store.rel(path) not in active_paths
        )
        for key, op in self.store.operations().items():
            if op["state"] == "cleanup":
                continue
            if op["action"] == "patch":
                remote = self.remote_record(op["old_id"])
                if remote and self.record.digest(remote) == self.record.digest(
                    op["fm"]
                ):
                    op["new_id"] = op["old_id"]
                else:
                    print(
                        f"  {S.warn('hold')}{op['path']}: "
                        f"{S.dim('update outcome differs; inspect the recovery journal')}"
                    )
                    continue
            elif not op.get("new_id"):
                if pending_matches[self.record.match_key(op["fm"])] != 1:
                    print(
                        f"  {S.warn('hold')}{op['path']}: "
                        f"{S.dim('multiple pending local records match; resolve manually')}"
                    )
                    continue
                candidates = [
                    fm
                    for fm in records
                    if fm["id"] != op.get("old_id")
                    and fm["id"] not in claimed
                    and self.record.match_key(fm) == self.record.match_key(op["fm"])
                ]
                if len(candidates) != 1:
                    print(
                        f"  {S.warn('hold')}{op['path']}: {len(candidates)} matching remote "
                        f"{S.dim('records; widen pull range or resolve manually')}"
                    )
                    continue
                op["new_id"] = candidates[0]["id"]
            claimed.add(op["new_id"])
            self.store.operation(key, op)
            self._commit(key, op, keep=op["action"] == "replace")
            print(f"  {S.ok('adop')}{S.dim('recovered')} {op['new_id']}")
        # Legacy fsync files used sync.created without a journal.
        active_paths = {op["path"] for op in self.store.operations().values()}
        for path, fm, body in self.scan()[2]:
            if self.store.rel(path) in active_paths:
                continue
            if pending_matches[self.record.match_key(fm)] != 1:
                print(
                    f"  {S.warn('hold')}{self.store.rel(path)}: "
                    f"{S.dim('multiple pending local records match')}"
                )
                continue
            matches = [
                r
                for r in records
                if r["id"] not in claimed
                and self.record.match_key(r) == self.record.match_key(fm)
            ]
            if len(matches) != 1:
                print(
                    f"  {S.warn('hold')}{self.store.rel(path)}: "
                    f"{S.dim(f'{len(matches)} matching remote records')}"
                )
                continue
            found = matches[0]
            fm["id"] = found["id"]
            fm["sync"] = {
                "pulled": self.clock.now().isoformat(),
                "digest": self.record.digest(found),
            }
            write_entry(path, fm, body)
            self.store.relocate(path, fm)
            claimed.add(found["id"])
        self.store.save_index(self.scan()[0])

    def pull(self, days=7, limit=500, force=False, points=None):
        self.scan()
        self.store.load_index()  # Validate before writing anything.
        since = (self.clock.today() - dt.timedelta(days=days - 1)).isoformat()
        points = self.remote.fetch(since, limit=limit) if points is None else points
        self.recover(points)
        by_id, _, _ = self.scan()
        doomed = self.store.pending_deletes(by_id)
        operations = self.store.operations()
        reserved = {op.get("old_id") for op in operations.values()} | {
            op.get("new_id") for op in operations.values()
        }
        returned, changed, held = set(), 0, 0
        for dp in points:
            fm = self.record.remote_to_fm(dp)
            eid = fm["id"]
            returned.add(eid)
            if eid in reserved:
                continue
            if eid in doomed and not force:
                print(
                    f"  {S.warn('held')}{doomed[eid].get('path', eid)}: {S.dim('deleted locally')}"
                )
                held += 1
                continue
            existing = by_id.get(eid)
            body = ""
            if existing:
                path, local, body = existing
                if self.record.dirty(local) and not force:
                    print(
                        f"  {S.warn('held')}{self.store.rel(path)}: {S.dim('locally modified')}"
                    )
                    held += 1
                    continue
            else:
                path = self.store.entry_path(fm)
                if path.exists():
                    raise ValueError(f"refusing to overwrite an unrelated file: {path}")
            self.stamp(fm)
            write_entry(path, fm, body)
            self.store.relocate(path, fm)
            changed += 1
        # Absence from a date query does not prove deletion: it may have moved.
        gone = set()
        for eid, meta in doomed.items():
            if (
                eid not in returned
                and since
                <= meta.get("start", "")[:10]
                <= self.clock.today().isoformat()
                and self.remote_record(eid) is None
            ):
                gone.add(eid)
        self.store.save_index(self.scan()[0], drop=gone)
        print(
            f"{S.bold('pulled')} {len(points)} {self.record.kind} records: "
            f"{changed} saved, {held} held"
        )
        return 1 if self.store.operations() or self.scan()[2] else 0

    def status(self):
        by_id, new, orphans = self.scan()
        dirty = [item for item in by_id.values() if self.record.dirty(item[1])]
        doomed = self.store.pending_deletes(by_id)
        for tag, colour, rows in (
            ("new", S.green, new),
            ("edit", S.yellow, dirty),
            ("hold", S.yellow, orphans),
        ):
            for path, fm, _ in rows:
                print(
                    f"  {S.tag(colour, tag)}{self.store.rel(path)} "
                    f"{S.dim('·')} {self.record.summary(fm)}"
                )
        for eid, meta in doomed.items():
            print(f"  {S.bad('del')}{meta.get('path', eid)}")
        for op in self.store.operations().values():
            print(
                f"  {S.warn('hold')}{op['path']}: {op['action']} {op['state']}; "
                f"{S.dim('pull to reconcile, push to finish cleanup')}"
            )
        print(
            f"{S.bold('status')} {len(by_id) - len(dirty)} in sync, {len(dirty)} modified, "
            f"{len(new)} new, {len(doomed)} deleted, {len(orphans)} awaiting pull, "
            f"{len(self.store.operations())} pending operations"
        )
        return 0

    def push(self, dry_run=False, yes=False, force=False, limit=500):
        by_id, new, orphans = self.scan()
        self.store.load_index()
        failed = len(orphans)
        for key, op in self.store.operations().items():
            if op["state"] == "cleanup" and not dry_run:
                try:
                    if not self._cleanup(key, op):
                        failed += 1
                except RemoteError as exc:
                    print(f"  {S.bad('part')}{op['path']}: {S.dim(exc)}")
                    failed += 1
            else:
                print(
                    f"  {S.warn('hold')}{op['path']}: "
                    f"{S.dim('run pull to reconcile before pushing')}"
                )
                failed += 1
        by_id, new, orphans = self.scan()
        active = self.store.operations()
        if active:
            # The original path may have been renamed while a request was in
            # flight. Until recovery identifies its record, another new file
            # might be that same create, so stop this collection's bulk push.
            print(S.yellow("push held until pending operations are recovered"))
            return 1
        work = new + [item for item in by_id.values() if self.record.dirty(item[1])]
        ok = 0
        for path, fm, body in work:
            try:
                if self.push_one(path, fm, body, dry_run, force):
                    ok += 1
                else:
                    failed += 1
            except (ValueError, RemoteError) as exc:
                print(f"  {S.bad('FAIL')}{self.store.rel(path)}: {S.dim(exc)}")
                failed += 1
        doomed = self.store.pending_deletes(self.scan()[0])
        eligible, gone = {}, set()
        for eid, meta in doomed.items():
            remote = self.remote_record(eid)
            if remote is None:
                gone.add(eid)
            elif not force and (
                not meta.get("digest")
                or not self.record.matches_digest(remote, meta["digest"])
            ):
                print(
                    f"  {S.bad('conf')}delete {eid}: "
                    f"{S.dim('remote changed or legacy baseline missing; ')}"
                    f"{S.dim('pull --force to restore and review')}"
                )
                failed += 1
            else:
                eligible[eid] = meta
        if eligible:
            print(
                f"{S.bold('would delete' if dry_run else 'about to delete')} "
                f"{len(eligible)} {self.record.kind} records:"
            )
            for eid, meta in eligible.items():
                print(
                    f"  {S.bad('del')}{meta.get('start', '')} "
                    f"{meta.get('summary', meta.get('name', eid))}"
                )
            confirmed = yes
            if not dry_run and not confirmed and sys.stdin.isatty():
                try:
                    confirmed = (
                        input(f"  {S.yellow('?')} delete remotely? [y/N] ")
                        .strip()
                        .lower()
                        == "y"
                    )
                except (EOFError, KeyboardInterrupt):
                    confirmed = False
            if not dry_run:
                if confirmed:
                    self.remote.delete(list(eligible))
                    gone.update(eligible)
                else:
                    print(
                        S.dim("deletion held; pass --yes to confirm without a terminal")
                    )
                    failed += len(eligible)
        if not dry_run:
            self.store.save_index(self.scan()[0], drop=gone)
        print(
            f"{S.bold('would push' if dry_run else 'pushed')} "
            f"{ok} ok, {failed} held or failed"
        )
        return int(failed > 0)

    def sync(self, pull=False, push=False, yes=False, limit=500):
        by_id, _, _ = self.scan()
        since = self.store.earliest_day(self.clock.today())
        points = self.remote.fetch(since.isoformat(), limit=limit)
        remote = {
            self.record.remote_to_fm(dp)["id"]: self.record.remote_to_fm(dp)
            for dp in points
        }
        doomed = self.store.pending_deletes(by_id)
        print(S.dim(f"range {since} .. {self.clock.today()}"))
        for eid, (path, fm, _) in by_id.items():
            other = remote.get(eid)
            if other is None:
                point = self.remote.get(eid)
                other = self.record.remote_to_fm(point) if point else None
                if other is not None:
                    remote[eid] = other
                    # pull will reuse a full record fetched by id outside the window.
                    points.append(point)
            if other is None:
                print(
                    f"  {S.bad('x')}{self.store.rel(path)}: "
                    f"{S.dim('gone remotely (kept locally)')}"
                )
            elif self.record.digest(fm) != self.record.digest(other):
                mark, colour = (
                    ("!", S.red)
                    if self.record.dirty(fm) and self.conflicts(fm, other)
                    else ("*", S.yellow)
                    if self.record.dirty(fm)
                    else (">", S.green)
                )
                print(f"  {S.tag(colour, mark)}{self.store.rel(path)}")
                for key, mine, theirs in self.record.diff(fm, other):
                    print(S.dim(f"         {key}: {mine} (here) vs {theirs} (remote)"))
        for eid, fm in remote.items():
            if eid not in by_id and eid not in doomed:
                print(
                    f"  {S.ok('>')}{self.record.time(fm)} "
                    f"{self.record.summary(fm)}: {S.dim('remote only')}"
                )
        self.status()
        if not (pull or push):
            if not sys.stdin.isatty():
                print(S.dim("pass --pull and/or --push to act"))
                return 0
            try:
                choice = input(
                    f"  {S.yellow('?')} "
                    f"{S.bold('1')} pull / {S.bold('2')} push / "
                    f"{S.bold('3')} both / {S.bold('n')} nothing: "
                ).strip()
            except (EOFError, KeyboardInterrupt):
                return 0
            pull, push = choice in ("1", "3"), choice in ("2", "3")
        rc = 0
        if pull:
            rc = self.pull((self.clock.today() - since).days + 1, limit, points=points)
        if push:
            rc = max(rc, self.push(yes=yes, limit=limit))
        return rc

    def tidy(self):
        by_id, new, orphans = self.scan()
        if self.store.operations():
            raise ValueError("recover pending operations before tidying")
        for path, fm, _ in list(by_id.values()) + new + orphans:
            self.store.relocate(path, fm)
        self.store.save_index(self.scan()[0])
        return 0
