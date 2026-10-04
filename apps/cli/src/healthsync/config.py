"""Configuration from config.toml; collections live under one data directory."""

import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

import tomllib

# Repository root: src/healthsync/ sits in apps/cli/, installed editable by uv.
ROOT = Path(__file__).resolve().parents[4]
CONFIG = ROOT / "config.toml"
KEYS = {"data_dir", "ghealth", "timezone", "weight_unit"}
# Index names predate the shared data directory; existing indexes keep them.
INDEXES = {"food": ".fsync-index.json", "weight": ".hsync-index.json"}


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
    named = getattr(args, "config", None) or os.getenv("HSYNC_CONFIG")
    source = (
        Path(named).expanduser().resolve()
        if named
        else (CONFIG if CONFIG.is_file() else None)
    )
    cfg = tomllib.loads(source.read_text()) if source else {}
    for key, value in cfg.items():
        if key not in KEYS:
            raise ValueError(f"{source}: unknown configuration key {key!r}")
        if not isinstance(value, str):
            raise TypeError(f"{source}: {key} must be a string")
    base = source.parent if source else ROOT

    def path(key, default):
        return (
            (base / Path(cfg[key]).expanduser()).resolve()
            if cfg.get(key)
            else default.resolve()
        )

    override = getattr(args, "data_dir", None) or os.getenv("HSYNC_DATA_DIR")
    data = (
        Path(override).expanduser().resolve()
        if override
        else path("data_dir", ROOT / "data")
    )
    directory = data / kind
    timezone = cfg.get("timezone", "America/Los_Angeles")
    ZoneInfo(timezone)
    unit = cfg.get("weight_unit", "kg")
    if unit not in ("kg", "lb"):
        raise ValueError("weight_unit must be kg or lb")
    ghealth = (
        Path(os.environ["GHEALTH"]).expanduser().resolve()
        if os.getenv("GHEALTH")
        else path("ghealth", ROOT / "vendor/google-health-cli/ghealth")
    )
    return Config(
        kind, directory, directory / INDEXES[kind], ghealth, timezone, unit, source
    )
