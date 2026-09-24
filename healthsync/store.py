"""Markdown records, collection-owned indexes, and durable operation recovery."""

from __future__ import annotations

import datetime as dt
import fcntl
import json
import re
from contextlib import contextmanager
from pathlib import Path

import yaml

from healthsync import style as S
from healthsync.common import tidy_numbers, write_atomic


def read_entry(path):
    text = path.read_text(encoding="utf-8")
    parts = re.fullmatch(
        r"---[ \t]*\n(.*?)^---[ \t]*(?:\n|\Z)(.*)", text, re.DOTALL | re.MULTILINE
    )
    if parts is None:
        raise ValueError("missing or unclosed YAML frontmatter")
    fm = yaml.safe_load(parts[1])
    if not isinstance(fm, dict):
        raise TypeError("frontmatter must be a mapping")
    for key in ("start", "end", "time"):
        if isinstance(fm.get(key), (dt.date, dt.datetime)):
            fm[key] = fm[key].isoformat()
    if fm.get("id") is not None:
        fm["id"] = str(fm["id"])
        if not re.fullmatch(r"[A-Za-z0-9_-]+", fm["id"]):
            raise ValueError("invalid remote id")
    if "sync" in fm and not isinstance(fm["sync"], dict):
        raise ValueError("sync must be a mapping")
    return fm, parts[2].lstrip("\n")


def write_entry(path, fm, body=""):
    order = (
        "id",
        "meal",
        "name",
        "start",
        "end",
        "time",
        "weight_kg",
        "remote_notes",
        "kcal",
        "carbs_g",
        "fat_g",
        "nutrients",
        "serving",
        "food_ref",
        "source",
        "sync",
    )
    ordered = {k: fm[k] for k in order if k in fm and fm[k] not in (None, "")}
    ordered.update(
        {k: v for k, v in fm.items() if k not in ordered and v not in (None, "")}
    )
    head = yaml.safe_dump(
        tidy_numbers(ordered), sort_keys=False, allow_unicode=True
    ).rstrip()
    write_atomic(path, f"---\n{head}\n---\n\n{body.strip()}\n")


class Store:
    def __init__(self, config, record):
        self.directory = config.directory
        self.index = config.index
        self.record = record
        self.journal = self.directory / f".{record.kind}-operations.json"

    @contextmanager
    def locked(self):
        # Serialize local commands across both old and new entrypoints.
        self.directory.mkdir(parents=True, exist_ok=True)
        with (self.directory / ".hsync.lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError(f"another command is using {self.directory}") from None
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def rel(self, path):
        return str(path.relative_to(self.directory))

    def entry_path(self, fm):
        return self.directory / self.record.day(fm) / self.record.filename(fm)

    def relocate(self, path, fm):
        target = self.entry_path(fm)
        if path != target:
            if target.exists():
                print(
                    f"  {S.warn('keep')}{self.rel(path)}; "
                    f"{S.dim('destination already exists')}"
                )
                return path
            target.parent.mkdir(parents=True, exist_ok=True)
            path.rename(target)
            if path.parent != self.directory and not any(path.parent.iterdir()):
                path.parent.rmdir()
        return target

    def scan(self):
        by_id, new, orphans, broken = {}, [], [], []
        for path in sorted(self.directory.rglob("*.md")):
            try:
                fm, body = read_entry(path)
                # Validate a copy: scanning must not change legacy digests or files.
                self.record.validate(dict(fm))
                item = (path, fm, body)
                if fm.get("id"):
                    if fm["id"] in by_id:
                        raise ValueError(f"duplicate remote id {fm['id']}")
                    by_id[fm["id"]] = item
                elif (fm.get("sync") or {}).get("created"):
                    orphans.append(item)
                else:
                    new.append(item)
            except (
                ValueError,
                TypeError,
                KeyError,
                OSError,
                yaml.YAMLError,
                OverflowError,
            ) as exc:
                broken.append((path, str(exc)))
        return by_id, new, orphans, broken

    def load_index(self):
        if not self.index.exists():
            legacy = self.directory.parent / ".fsync-index.json"
            if (
                self.record.kind == "food"
                and self.index == self.directory / ".fsync-index.json"
                and legacy.is_file()
            ):
                # Read the old location without moving it during previews.
                data = json.loads(legacy.read_text())
                if not isinstance(data, dict) or not isinstance(
                    data.get("entries"), dict
                ):
                    raise ValueError(f"{legacy}: invalid legacy index")
                if data["entries"] and not (set(data["entries"]) & set(self.scan()[0])):
                    raise ValueError(
                        f"{legacy}: cannot establish ownership; configure an explicit food index after reviewing it"
                    )
                return data["entries"]
            return {}
        data = json.loads(self.index.read_text())
        if not isinstance(data, dict):
            raise TypeError(f"{self.index}: invalid index")
        if data.get("kind", self.record.kind) != self.record.kind:
            raise ValueError(f"{self.index}: index belongs to another record type")
        owner = data.get("directory")
        moved_together = (
            owner and not Path(owner).exists() and self.index.parent == self.directory
        )
        if owner not in (None, str(self.directory)) and not moved_together:
            raise ValueError(
                f"{self.index}: index belongs to another directory; move the whole collection or use a fresh index"
            )
        entries = data.get("entries")
        if not isinstance(entries, dict) or any(
            not isinstance(meta, dict)
            or not re.fullmatch(r"[A-Za-z0-9_-]+", eid)
            or any(
                key in meta and meta[key] is not None and not isinstance(meta[key], str)
                for key in ("start", "path", "digest")
            )
            for eid, meta in entries.items()
        ):
            raise ValueError(f"{self.index}: invalid index; restore it before syncing")
        return entries

    def save_index(self, by_id, drop=()):
        migrating = not self.index.exists()
        entries = self.load_index()
        for eid in drop:
            entries.pop(eid, None)
        for eid, (path, fm, _) in by_id.items():
            prior = entries.get(eid, {})
            entries[eid] = {
                "name": self.record.label(fm),
                "start": self.record.time(fm),
                "summary": self.record.summary(fm),
                "path": self.rel(path),
                "digest": (fm.get("sync") or {}).get("digest") or prior.get("digest"),
            }
        write_atomic(
            self.index,
            json.dumps(
                {
                    "version": 1,
                    "kind": self.record.kind,
                    "directory": str(self.directory),
                    "entries": entries,
                },
                indent=2,
                sort_keys=True,
            ),
        )
        legacy = self.directory.parent / ".fsync-index.json"
        if (
            migrating
            and self.record.kind == "food"
            and self.index == self.directory / ".fsync-index.json"
            and legacy.is_file()
        ):
            # Keep a backup instead of leaving an active shared parent index
            # that a different food folder could accidentally inherit.
            backup = legacy.with_name(".fsync-index.migrated.json")
            i = 2
            while backup.exists():
                backup = legacy.with_name(f".fsync-index.migrated-{i}.json")
                i += 1
            legacy.rename(backup)
            print(
                S.dim(f"migrated legacy food index to {self.index}; backup: {backup}")
            )

    def pending_deletes(self, by_id):
        return {
            eid: meta for eid, meta in self.load_index().items() if eid not in by_id
        }

    def operations(self):
        if not self.journal.exists():
            return {}
        data = json.loads(self.journal.read_text())
        if not isinstance(data, dict) or any(
            not isinstance(op, dict)
            or not {"action", "state", "path", "fm", "input_digest"} <= op.keys()
            or op["action"] not in ("create", "patch", "replace")
            or op["state"] not in ("requested", "acknowledged", "cleanup")
            or not isinstance(op["fm"], dict)
            or not isinstance(op["path"], str)
            or Path(op["path"]).is_absolute()
            or ".." in Path(op["path"]).parts
            for op in data.values()
        ):
            raise ValueError(f"invalid recovery journal: {self.journal}")
        return data

    def operation(self, key, value):
        data = self.operations()
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
        write_atomic(self.journal, json.dumps(data, indent=2, sort_keys=True))

    def earliest_day(self, today):
        # Include indexed dates: deleting the last file in an older folder
        # must not shrink the reconciliation window past its tombstone.
        days = [today]
        by_id, new, orphans, _ = self.scan()
        values = [
            self.record.time(fm) for _, fm, _ in list(by_id.values()) + new + orphans
        ]
        values += [meta.get("start", "") for meta in self.load_index().values()]
        for value in values:
            try:
                days.append(dt.date.fromisoformat(str(value)[:10]))
            except ValueError:
                pass
        return min(days)
