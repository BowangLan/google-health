"""Small durable store. Bearer credentials are stored only as SHA-256 hashes."""

import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class State:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.transaction() as db:
            db.execute("CREATE TABLE IF NOT EXISTS state "
                       "(kind TEXT, key TEXT, body TEXT, expires REAL, PRIMARY KEY(kind,key))")
        self.path.chmod(0o600)

    @contextmanager
    def transaction(self):
        with sqlite3.connect(self.path, timeout=30) as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise

    def put(self, kind, key, body, expires=None, db=None):
        if db is None:
            with self.transaction() as db:
                return self.put(kind, key, body, expires, db)
        db.execute("INSERT OR REPLACE INTO state VALUES (?,?,?,?)",
                   (kind, key, json.dumps(body, allow_nan=False), expires))

    def get(self, kind, key, consume=False, db=None):
        if db is None:
            with self.transaction() as db:
                return self.get(kind, key, consume, db)
        row = db.execute("SELECT body,expires FROM state WHERE kind=? AND key=?", (kind, key)).fetchone()
        if row is None:
            return None
        if consume or (row[1] is not None and row[1] <= time.time()):
            db.execute("DELETE FROM state WHERE kind=? AND key=?", (kind, key))
        if row[1] is not None and row[1] <= time.time():
            return None
        return json.loads(row[0])

    def clear(self, kinds, db=None):
        if db is None:
            with self.transaction() as db:
                return self.clear(kinds, db)
        for kind in kinds:
            db.execute("DELETE FROM state WHERE kind=?", (kind,))

    def count(self, kind):
        with self.transaction() as db:
            db.execute("DELETE FROM state WHERE expires IS NOT NULL AND expires <= ?", (time.time(),))
            return db.execute("SELECT count(*) FROM state WHERE kind=?", (kind,)).fetchone()[0]
