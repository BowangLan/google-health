"""Command parsing and presentation; sync decisions live in Engine."""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from zoneinfo import ZoneInfoNotFoundError

from healthsync import food_commands
from healthsync import style as S
from healthsync.common import Clock, number
from healthsync.config import resolve
from healthsync.google_health import GoogleHealth, RemoteError
from healthsync.records.food import Food
from healthsync.records.weight import POUND_KG, Weight
from healthsync.store import Store
from healthsync.sync import Engine


def positive(value):
    result = int(value)
    if result < 1:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return result


def common_options():
    parser = argparse.ArgumentParser(add_help=False)
    for flag, help_text in (
        ("config", "configuration file"),
        ("food-dir", "food record directory"),
        ("weight-dir", "weight record directory"),
    ):
        parser.add_argument(f"--{flag}", default=argparse.SUPPRESS, help=help_text)
    return parser


def command(sub, name, common, **kwargs):
    return sub.add_parser(name, parents=[common], **kwargs)


def shared_commands(sub, common, aggregate=False):
    parsers = {}
    for name, description in (
        ("pull", "fetch Google Health records"),
        ("push", "send local changes"),
        ("status", "show local changes"),
        ("sync", "compare both sides, then choose"),
        ("tidy", "organize files by their timestamps"),
        ("config", "show resolved configuration"),
    ):
        sp = command(sub, name, common, help=description)
        parsers[name] = sp
        if aggregate:
            sp.add_argument(
                "--all",
                required=True,
                action="store_true",
                help="include food and weight",
            )
        if name in ("pull", "push", "sync"):
            sp.add_argument(
                "--limit", type=positive, default=500, help="remote list page size"
            )
        if name == "pull":
            sp.add_argument("--days", type=positive, default=7)
            sp.add_argument(
                "--force",
                action="store_true",
                help="discard local edits and restore local deletions",
            )
        if name == "push":
            sp.add_argument("-n", "--dry-run", action="store_true")
            sp.add_argument(
                "--force",
                action="store_true",
                help="explicitly choose local changes over remote changes",
            )
        if name in ("push", "sync"):
            sp.add_argument(
                "-y", "--yes", action="store_true", help="confirm remote deletions"
            )
        if name == "sync":
            sp.add_argument(
                "--pull", action="store_true", help="apply remote changes locally"
            )
            sp.add_argument(
                "--push", action="store_true", help="send local changes to Google Health"
            )
            sp.add_argument(
                "-n", "--dry-run", action="store_true",
                help="compare only; never prompt or change records, even with --pull/--push",
            )
    return parsers


def add_options(parser):
    parser.add_argument("--date", help="today | yesterday | YYYY-MM-DD")
    parser.add_argument(
        "-t", "--at", help="local HH:MM (default: now; noon for past dates)"
    )
    parser.add_argument("--note", help="private local note")
    parser.add_argument("--no-push", action="store_true", help="save locally only")
    parser.add_argument(
        "-n",
        "--dry-run",
        action="store_true",
        help="show payload without writing files or remote data",
    )


def record_commands(sub, common, kind):
    shared_commands(sub, common)
    add = command(
        sub, "add", common, help="save a new record and push only that record"
    )
    add_options(add)
    if kind == "food":
        add.add_argument("meal", help="breakfast | lunch | dinner | snack | anytime")
        add.add_argument("name")
        add.add_argument("kcal", type=float)
        for short, long in (
            ("c", "carbs"),
            ("f", "fat"),
            ("p", "protein"),
            ("s", "sugar"),
            ("d", "fiber"),
        ):
            add.add_argument(
                f"-{short}",
                f"--{long}",
                type=float,
                help="grams for the entire portion",
            )
        add.add_argument(
            "--sodium-mg", type=float, help="milligrams for the entire portion"
        )
        add.add_argument("-u", "--unit", default="serving")
        add.add_argument("-a", "--amount", type=float, default=1)
        clone = command(sub, "clone", common, help="copy a past food at a new amount")
        clone.add_argument("keyword")
        clone.add_argument("--index", type=positive)
        clone.add_argument("--amount", type=float)
        clone.add_argument("--no-push", action="store_true")
        clone.add_argument("-n", "--dry-run", action="store_true")
        total = command(sub, "total", common, help="daily calories and macros")
        total.add_argument("date", nargs="?", default="today")
    else:
        add.add_argument("value", type=float)
        add.add_argument(
            "-u", "--unit", choices=("kg", "lb"), help="default: configured weight_unit"
        )
        add.add_argument("--remote-note", help="note synced to Google Health")
        listing = command(sub, "list", common, help="show local measurements")
        listing.add_argument("--days", type=positive, default=30)
        listing.add_argument("--unit", choices=("kg", "lb"))


def parser(legacy=False):
    common = common_options()
    root = argparse.ArgumentParser(
        prog="fsync" if legacy else "hsync",
        parents=[common],
        description="Sync editable food and weight files with Google Health.",
    )
    sub = root.add_subparsers(dest="kind" if not legacy else "cmd", required=True)
    if legacy:
        root.set_defaults(kind="food")
        record_commands(sub, common, "food")
    else:
        for kind in ("food", "weight"):
            group = command(sub, kind, common, help=f"manage {kind} records")
            record_commands(
                group.add_subparsers(dest="cmd", required=True), common, kind
            )
        shared_commands(sub, common, aggregate=True)
    return root


def run(engine, cfg, args):
    cmd = args.cmd
    if cmd == "config":
        print(f"{S.bold('config')} {cfg.source or S.dim('(defaults)')}")
        for key, value in (
            (f"{cfg.kind}_dir", cfg.directory),
            ("index", cfg.index),
            ("ghealth", cfg.ghealth),
            ("timezone", cfg.timezone),
            ("weight_unit", cfg.weight_unit),
        ):
            print(f"  {S.dim(f'{key:<12}')} {value}")
        return 0
    if cmd == "pull":
        return engine.pull(args.days, args.limit, args.force)
    if cmd == "push":
        return engine.push(args.dry_run, args.yes, args.force, args.limit)
    if cmd == "sync":
        return engine.sync(args.pull, args.push, args.yes, args.limit, args.dry_run)
    if cmd == "status":
        return engine.status()
    if cmd == "tidy":
        return engine.tidy()
    if cfg.kind == "food":
        return getattr(food_commands, cmd)(engine, args)
    if cmd == "add":
        unit = args.unit or cfg.weight_unit
        value = number(args.value, "weight")
        stamp, placeholder = engine.clock.entry_time(args.date, args.at)
        fm = {"time": stamp, "weight_kg": value * POUND_KG if unit == "lb" else value}
        if args.remote_note is not None:
            fm["remote_notes"] = args.remote_note
        note = args.note or ""
        if placeholder:
            note = (
                note + "\nNoon is a placeholder; the time was not supplied."
            ).strip()
        return engine.add(fm, note, args.no_push, args.dry_run)
    if cmd == "list":
        by_id, new, orphans = engine.scan()
        since = engine.clock.today() - dt.timedelta(days=args.days - 1)
        rows = [
            fm
            for _, fm, _ in list(by_id.values()) + new + orphans
            if since.isoformat()
            <= engine.record.day(fm)
            <= engine.clock.today().isoformat()
        ]
        for fm in sorted(rows, key=lambda fm: fm["time"]):
            print(
                f"  {S.dim(fm['time'][:16])}  "
                f"{S.bold(engine.record.summary(fm, args.unit or cfg.weight_unit))}"
            )
        print(f"{S.bold(len(rows))} measurements")
        return 0
    raise ValueError(f"unknown command {cmd}")


def main(argv=None, legacy=False):
    args = parser(legacy).parse_args(argv)
    aggregate = args.kind not in ("food", "weight")
    if aggregate:
        args.cmd = args.kind
    kinds = ("food", "weight") if aggregate else (args.kind,)
    try:
        # Resolve both configurations before any aggregate operation can act.
        configs = [resolve(args, kind) for kind in kinds]
        rc = 0
        for cfg in configs:
            record = Food() if cfg.kind == "food" else Weight()
            store = Store(cfg, record)
            engine = Engine(
                store,
                GoogleHealth(cfg.ghealth, record, cfg.timezone),
                Clock(cfg.timezone),
            )
            if aggregate:
                print(f"\n{S.bold(cfg.kind + ':')}")
            if args.cmd == "config" or (args.cmd == "add" and args.dry_run):
                rc = max(rc, run(engine, cfg, args))
            else:
                with store.locked():
                    rc = max(rc, run(engine, cfg, args))
        return rc
    except (
        ValueError,
        TypeError,
        KeyError,
        OSError,
        RemoteError,
        ZoneInfoNotFoundError,
    ) as exc:
        print(S.red(f"{'fsync' if legacy else 'hsync'}: {exc}"), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print(
            S.yellow("interrupted; pending operations are retained for recovery"),
            file=sys.stderr,
        )
        return 130
