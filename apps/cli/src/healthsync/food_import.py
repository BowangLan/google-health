"""Import food-export CSV rows locally; never contacts Google Health.

Usage: hsync food import path/to/food-log.csv [--dry-run] [--data-dir DIR]
Notes are ignored. Repeated rows are preserved as separate servings/records.
The private csv_import_key field identifies rows on subsequent imports. Keep
that field to avoid duplicates if you rerun the import after editing files.
"""

from collections import Counter
import csv
import datetime as dt
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from healthsync.config import resolve
from healthsync.records.food import Food
from healthsync.store import Store, write_entry


NUTRIENTS = {
    "Protein (g)": ("PROTEIN", 1),
    "Fiber (g)": ("DIETARY_FIBER", 1),
    "Vitamin C (mg)": ("VITAMIN_C", 1000),
    "Vitamin D (mcg)": ("VITAMIN_D", 1_000_000),
    "Iron (mg)": ("IRON", 1000),
    "Calcium (mg)": ("CALCIUM", 1000),
}
MACROS = {"Calories (kcal)": "kcal", "Carbs (g)": "carbs_g", "Fat (g)": "fat_g"}


def quantity(row, column, divisor=1):
    try:
        value = Decimal(row[column].strip()) / divisor
    except (InvalidOperation, AttributeError):
        raise ValueError(f"{column}: expected a number") from None
    if not value.is_finite() or value < 0:
        raise ValueError(f"{column}: expected a finite, nonnegative number")
    return float(value)


def read_csv(path, record, timezone):
    entries = []
    occurrences = Counter()
    with path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        required = {"Date", "Logged At", "Description", *MACROS, *NUTRIENTS}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"missing CSV columns: {', '.join(sorted(missing))}")
        for row in reader:
            try:
                if None in row or any(row[key] is None for key in required):
                    raise ValueError("incorrect number of CSV fields")
                stamp = dt.datetime.strptime(
                    f"{row['Date'].strip()} {row['Logged At'].strip()}",
                    "%m/%d/%y %H:%M",
                ).replace(tzinfo=ZoneInfo(timezone))
                fm = {
                    "meal": "ANYTIME",
                    "name": row["Description"].strip(),
                    "start": stamp.isoformat(timespec="seconds"),
                    **{key: quantity(row, column) for column, key in MACROS.items()},
                    "nutrients": {
                        key: quantity(row, column, divisor)
                        for column, (key, divisor) in NUTRIENTS.items()
                    },
                    "serving": {"amount": 1, "unit": "serving"},
                }
                record.validate(fm)
                # Notes and input path intentionally do not affect identity.
                fingerprint = hashlib.sha256(
                    json.dumps(fm, sort_keys=True, ensure_ascii=False).encode()
                ).hexdigest()
                occurrences[fingerprint] += 1
                fm["csv_import_key"] = f"{fingerprint}:{occurrences[fingerprint]}"
                entries.append(fm)
            except (ValueError, OverflowError) as exc:
                raise ValueError(f"CSV line {reader.line_num}: {exc}") from None
    return entries


def add_arguments(parser):
    parser.add_argument("csv", type=Path, help="food-export CSV file")
    parser.add_argument("--dry-run", action="store_true", help="report without writing files")


def run(args):
    config = resolve(args, "food")
    record = Food()
    # Validate the entire input before writing any records.
    entries = read_csv(args.csv.expanduser(), record, config.timezone)
    store = Store(config, record)
    with store.locked():
        by_id, new, orphans, broken = store.scan()
        if broken:
            raise ValueError(f"fix invalid existing log files before importing: {broken}")
        existing = {
            fm.get("csv_import_key")
            for _, fm, _ in [*by_id.values(), *new, *orphans]
        }
        pending = [fm for fm in entries if fm["csv_import_key"] not in existing]
        reserved = set()
        planned = []
        for fm in pending:
            base = store.entry_path(fm)
            target = base
            suffix = 2
            while target.exists() or target in reserved:
                target = base.with_name(f"{base.stem}--{suffix}.md")
                suffix += 1
            reserved.add(target)
            planned.append((target, fm))
        if not args.dry_run:
            for target, fm in planned:
                write_entry(target, fm)  # Creates the day directory; empty body.
        verb = "Would create" if args.dry_run else "Created"
        print(f"{verb} {len(planned)} logs; skipped {len(entries) - len(pending)} already imported rows.")
        if entries:
            days = sorted({record.day(fm) for fm in entries})
            print(f"{days[0]} through {days[-1]} ({len(days)} days) in {config.directory}")
        print("Local files only; nothing pushed.")
    return 0

