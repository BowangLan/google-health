"""Pull food, weight, and read-only activity on a fixed interval.

Activity (calories burned, steps, distance, workouts) pulls the last 7 days and
heart rate the last 2, so the final hour of yesterday completes after midnight;
--days applies only to food and weight. Run distance is derived from
workouts. Pull keeps local edits and deletions, so it is safe to leave running.
A failed pull (network, or another hsync holding the lock) is reported and
retried on the next tick. Ctrl-C stops it.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import io
import sys
import time


def add_arguments(parser):
    parser.add_argument(
        "--interval", type=int, default=300, help="seconds between pulls (default: 300)"
    )
    parser.add_argument(
        "--days", type=int, default=7, help="food and weight window (default: 7)"
    )


def run(args):
    from healthsync.cli import main

    # --config and --data-dir reach every pull.
    shared = [
        part
        for flag, name in (("--config", "config"), ("--data-dir", "data_dir"))
        if hasattr(args, name)
        for part in (flag, getattr(args, name))
    ]
    try:
        while True:
            print(f"[{dt.datetime.now():%Y-%m-%d %H:%M:%S}] pull", flush=True)
            if code := main(["pull", "--all", "--days", str(args.days), *shared]):
                print(f"pull failed (exit {code}); retrying in {args.interval}s", file=sys.stderr)
            # Show the latest row and the count, not every row of the window.
            for kind in ("cal", "steps", "distance", "hr", "workouts"):
                days = "2" if kind == "hr" else "7"
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    code = main([kind, "pull", "--days", days, *shared])
                if code:
                    print(f"{kind} pull failed (exit {code}); retrying in {args.interval}s",
                          file=sys.stderr)
                else:
                    tail = "\n".join(out.getvalue().rstrip("\n").splitlines()[-2:])
                    print(f"\n{kind}:\n{tail}", flush=True)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print()
        return 0
