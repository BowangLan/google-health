"""Per-collection configuration with legacy fsync compatibility."""

import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

import tomllib

HERE = Path(__file__).resolve().parent.parent
SEARCH = (
    HERE / "hsync.toml",
    HERE / "fsync.toml",
    Path.home() / ".config/hsync/config.toml",
    Path.home() / ".config/fsync/config.toml",
)
KEYS = {
    "food_dir",
    "weight_dir",
    "ghealth",
    "index",
    "food_index",
    "weight_index",
    "timezone",
    "weight_unit",
}


@dataclass(frozen=True)
class Config:
    kind: str
    directory: Path
    index: Path
    ghealth: Path
    timezone: str = "America/Los_Angeles"
    weight_unit: str = "kg"
    source: Path | None = None


def resolve(args, kind):
    named = (
        getattr(args, "config", None)
        or os.getenv("HSYNC_CONFIG")
        or os.getenv("FSYNC_CONFIG")
    )
    source = (
        Path(named).expanduser().resolve()
        if named
        else next((p for p in SEARCH if p.is_file()), None)
    )
    cfg = tomllib.loads(source.read_text()) if source else {}
    for key, value in cfg.items():
        if key not in KEYS:
            raise ValueError(f"{source}: unknown configuration key {key!r}")
        if not isinstance(value, str):
            raise TypeError(f"{source}: {key} must be a string")
    base = source.parent if source else HERE

    def path(key, default):
        return (
            (base / Path(cfg[key]).expanduser()).resolve()
            if cfg.get(key)
            else default.resolve()
        )

    directories = {}
    for collection in ("food", "weight"):
        key = f"{collection}_dir"
        override = (
            getattr(args, key, None)
            or os.getenv(f"HSYNC_{key.upper()}")
            or (os.getenv("FSYNC_FOOD_DIR") if collection == "food" else None)
        )
        directories[collection] = (
            Path(override).expanduser().resolve()
            if override
            else path(key, HERE / collection)
        )
    food, weight = directories["food"], directories["weight"]
    if food == weight or food in weight.parents or weight in food.parents:
        raise ValueError(
            "food_dir and weight_dir must be separate, non-nested directories"
        )
    indexes = {
        "food": path("food_index", path("index", food / ".fsync-index.json")),
        "weight": path("weight_index", weight / ".hsync-index.json"),
    }
    if indexes["food"] == indexes["weight"]:
        raise ValueError("food and weight cannot share an index")
    for collection, index in indexes.items():
        other = directories["weight" if collection == "food" else "food"]
        if index == other or other in index.parents:
            raise ValueError(f"{collection} index cannot live in the other collection")
    timezone = cfg.get("timezone", "America/Los_Angeles")
    ZoneInfo(timezone)
    unit = cfg.get("weight_unit", "kg")
    if unit not in ("kg", "lb"):
        raise ValueError("weight_unit must be kg or lb")
    ghealth = (
        Path(os.environ["GHEALTH"]).expanduser().resolve()
        if os.getenv("GHEALTH")
        else path("ghealth", HERE / "google-health-cli/ghealth")
    )
    return Config(
        kind, directories[kind], indexes[kind], ghealth, timezone, unit, source
    )
