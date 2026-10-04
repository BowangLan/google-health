"""Command parsing and presentation; sync decisions live in Engine."""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
import sys
from zoneinfo import ZoneInfoNotFoundError

from healthsync import activity, auth, burned, food_commands, food_import, watch, workouts
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
        ("data-dir", "directory holding food/ and weight/"),
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


def parser():
    common = common_options()
    root = argparse.ArgumentParser(
        prog="hsync",
        parents=[common],
        description="Sync editable food and weight files with Google Health.",
    )
    sub = root.add_subparsers(dest="kind", required=True)
    for kind in ("food", "weight"):
        group = command(sub, kind, common, help=f"manage {kind} records")
        kind_sub = group.add_subparsers(dest="cmd", required=True)
        record_commands(kind_sub, common, kind)
        if kind == "food":
            food_import.add_arguments(command(
                kind_sub, "import", common,
                help="import a food-export CSV as local files; never pushes",
            ))
    group = command(sub, "cal", common, help="daily calories burned (read-only)")
    burned_sub = group.add_subparsers(dest="cmd", required=True)
    for name, description in (
        ("pull", "fetch daily totals from Google Health"),
        ("list", "show saved daily totals"),
    ):
        sp = command(burned_sub, name, common, help=description)
        sp.add_argument("--days", type=positive, default=7)
    for metric, description in (
        ("steps", "daily step totals (read-only)"),
        ("distance", "daily distance totals (read-only)"),
        ("hr", "hourly heart rate: average, minimum, maximum (read-only)"),
    ):
        group = command(sub, metric, common, help=description)
        metric_sub = group.add_subparsers(dest="cmd", required=True)
        rows = "hours" if activity.METRICS[metric].hourly else "days"
        for name, action in (
            ("pull", f"fetch {rows} from Google Health"),
            ("list", f"show saved {rows}"),
        ):
            sp = command(metric_sub, name, common, help=action)
            # A day of heart rate is 24 rows, so its window defaults to today.
            sp.add_argument("--days", type=positive, default=1 if rows == "hours" else 7)
    for kind, description, rows in (
        ("workouts", "Fitbit workout sessions (read-only)", "sessions"),
        ("run", "daily run distance from Fitbit runs and treadmill sessions (read-only)", "days"),
    ):
        group = command(sub, kind, common, help=description)
        kind_sub = group.add_subparsers(dest="cmd", required=True)
        for name, action in (
            ("pull", "fetch workouts from Google Health"),
            ("list", f"show saved {rows}"),
        ):
            sp = command(kind_sub, name, common, help=action)
            sp.add_argument("--days", type=positive, default=7)
    shared_commands(sub, common, aggregate=True)
    auth.add_arguments(command(sub, "auth", common, help="log in, or show login status or scopes"))
    watch.add_arguments(command(sub, "watch", common, help="pull everything on an interval"))
    web = command(sub, "web", common, help="serve the local web app and its API")
    web.add_argument("--port", type=int, default=8787)
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


def run_burned(args):
    cfg = resolve(args, "food")
    clock = Clock(cfg.timezone)
    if args.cmd == "pull":
        rows = burned.pull(cfg, clock, args.days)
    else:
        since = (clock.today() - dt.timedelta(days=args.days - 1)).isoformat()
        rows = {day: v for day, v in burned.load(cfg).items() if day >= since}
    for day, value in sorted(rows.items()):
        kcal = f"{value['kcal']:,.0f}"
        fetched = value["fetched"][:16].replace("T", " ")
        print(f"  {S.dim(day)}  {S.bold(kcal)} kcal  {S.dim('fetched ' + fetched)}")
    print(f"{S.bold(len(rows))} days")
    return 0


def run_activity(args):
    cfg = resolve(args, "food")
    clock = Clock(cfg.timezone)
    metric = activity.METRICS[args.kind]
    if args.cmd == "pull":
        rows = activity.pull(cfg, clock, metric, args.days)
    else:
        since = (clock.today() - dt.timedelta(days=args.days - 1)).isoformat()
        rows = {k: v for k, v in activity.load(cfg, metric).items() if k[:10] >= since}
    for row, value in sorted(rows.items()):
        when = row[:16].replace("T", " ")
        fetched = value["fetched"][:16].replace("T", " ")
        print(
            f"  {S.dim(when)}  {S.bold(activity.describe(metric, value))}"
            f"  {S.dim('fetched ' + fetched)}"
        )
    print(f"{S.bold(len(rows))} {'hours' if metric.hourly else 'days'}")
    return 0


def run_workouts(args):
    cfg = resolve(args, "food")
    clock = Clock(cfg.timezone)
    since = (clock.today() - dt.timedelta(days=args.days - 1)).isoformat()
    counts = None
    if args.cmd == "pull":
        _, counts = workouts.pull(cfg, clock, args.days)
    saved = {k: v for k, v in workouts.load(cfg).items() if v["start"][:10] >= since}
    if args.kind == "run":
        rows = workouts.run_days(saved)
        for day, value in sorted(rows.items()):
            runs = f"{value['runs']} run" + ("s" if value["runs"] > 1 else "")
            print(f"  {S.dim(day)}  {S.bold(workouts.distance(value['meters']))}  {S.dim(runs)}")
        print(f"{S.bold(len(rows))} days with runs")
    else:
        for fields in sorted(saved.values(), key=lambda v: v["start"]):
            when = fields["start"][:16].replace("T", " ")
            print(f"  {S.dim(when)}  {S.bold(workouts.describe(fields))}")
        print(f"{S.bold(len(saved))} workouts")
    if counts:
        print(S.dim("{} new, {} changed, {} removed".format(*counts)))
    return 0


def main(argv=None):
    args = parser().parse_args(argv)
    if args.kind == "web":
        from healthsync import web

        return web.serve(args.port)
    if args.kind in ("auth", "watch") or (args.kind == "food" and args.cmd == "import"):
        tool = food_import if args.kind == "food" else auth if args.kind == "auth" else watch
        try:
            return tool.run(args)
        except (ValueError, OSError, subprocess.CalledProcessError) as exc:
            print(S.red(f"hsync: {exc}"), file=sys.stderr)
            return 1
    if args.kind in ("cal", "workouts", "run") or args.kind in activity.METRICS:
        try:
            if args.kind in ("workouts", "run"):
                return run_workouts(args)
            return run_burned(args) if args.kind == "cal" else run_activity(args)
        except (ValueError, TypeError, OSError, RemoteError) as exc:
            print(S.red(f"hsync: {exc}"), file=sys.stderr)
            return 1
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
        print(S.red(f"hsync: {exc}"), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print(
            S.yellow("interrupted; pending operations are retained for recovery"),
            file=sys.stderr,
        )
        return 130
