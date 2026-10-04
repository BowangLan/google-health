"""Google Health login, status, and granted scopes through ghealth."""

from __future__ import annotations

import json
import os
import subprocess

from healthsync.config import resolve

SCOPES = ",".join((
    "nutrition.readonly",
    "nutrition.writeonly",
    "health_metrics_and_measurements.readonly",
    "health_metrics_and_measurements.writeonly",
    "activity_and_fitness.readonly",
))


def add_arguments(parser):
    parser.add_argument(
        "action", nargs="?", default="login", choices=("login", "status", "scopes"),
        help="default: login",
    )


def run(args):
    binary = str(resolve(args, "food").ghealth)
    if args.action == "login":
        os.execv(binary, [binary, "auth", "login", "--scopes", SCOPES])
    if args.action == "status":
        os.execv(binary, [binary, "auth", "status"])
    exported = subprocess.run(
        [binary, "auth", "export"], capture_output=True, text=True, check=True
    )
    print(json.dumps(json.loads(exported.stdout).get("scopes"), indent=2))
    return 0
