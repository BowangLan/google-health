"""Narrow MCP tools over the existing journal and CLI. No bulk push or delete."""

import asyncio
import datetime as dt
import json
from typing import Annotated, Any, Literal
from uuid import UUID

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.types import ToolAnnotations
from pydantic import Field

from healthsync import activity, burned, web, workouts
from healthsync.common import Clock

from .state import digest

Nonnegative = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Days = Annotated[int, Field(ge=1, le=90)]
Text = Annotated[str, Field(min_length=1, max_length=300)]


def require(scope):
    token = get_access_token()
    if token is None or scope not in token.scopes:
        raise ValueError(f"Reconnect with the {scope} permission to use this tool.")


def public(value):
    """Private journal bodies and host paths are never sent through MCP reads."""
    if isinstance(value, list):
        return [public(item) for item in value]
    if isinstance(value, dict):
        return {key: public(item) for key, item in value.items()
                if key not in ("note", "path", "broken", "weight_broken")}
    return value


def receipt(request_id):
    _, store, record = web.context("food")
    rows, _ = web.entries(store, record)
    matches = [web.food_row(state, store, path, fm, body)
               for state, path, fm, body in rows
               if f"MCP request: {request_id}" in body.splitlines()]
    if len(matches) == 1 and matches[0]["id"] and matches[0]["state"] == "synced":
        return {"status": "logged", "request_id": request_id, "food": public(matches[0])}
    return None


def log_once(state, request_id, values):
    fingerprint = digest(json.dumps(values, sort_keys=True, allow_nan=False))
    # Claim before creating any file or making a remote call, across processes.
    with state.transaction() as db:
        saved = state.get("write", request_id, db=db)
        if saved is None:
            state.put("write", request_id, {"fingerprint": fingerprint, "result": None}, db=db)
    if saved is not None:
        if saved["fingerprint"] != fingerprint:
            raise ValueError("This request_id was already used with different food values. Use a new UUID for a new meal.")
        return receipt(request_id) or saved["result"] or {
            "status": "needs_review", "request_id": request_id,
            "message": "The previous attempt may still be running or may have reached Google. Refresh food and review the dashboard. Do not retry with a new request ID.",
        }
    note = values.pop("note", "")
    values["note"] = (note + f"\nMCP request: {request_id}").strip()
    result = web.run(web.argv({"collection": "food", "command": "add", "values": values}))
    response = receipt(request_id)
    if response is None:
        response = {
            "status": "needs_review", "request_id": request_id,
            "message": "Food was not confirmed synced. Review the dashboard and refresh food to reconcile before retrying. The saved request ID prevents duplicate creates.",
            "exit_code": result["code"],
        }
    state.put("write", request_id, {"fingerprint": fingerprint, "result": response})
    return response


def register_tools(mcp, state):
    read = ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False)
    refresh = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=True)
    write = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=True)
    def auth_meta(scope):
        return {"securitySchemes": [{"type": "oauth2", "scopes": [scope]}]}

    @mcp.tool(annotations=read, meta=auth_meta("health.read"))
    async def get_food_day(date: str = "today") -> dict[str, Any]:
        """Read saved food and nutrition totals for a local date (today, yesterday, YYYY-MM-DD).
        Reports local sync state; call refresh_health_data for newer Google data. Private notes are omitted.
        """
        require("health.read")
        data = await asyncio.to_thread(web.day_view, date)
        # This tool reads food only; don't include weight or dashboard preferences.
        return public({key: value for key, value in data.items() if key in ("day", "timezone", "today", "food", "totals")})

    @mcp.tool(annotations=read, meta=auth_meta("health.read"))
    async def get_weight_history(days: Days = 30, unit: Literal["kg", "lb"] = "kg") -> dict[str, Any]:
        """Read saved weight measurements for the last 1-90 local days, with explicit units and sync state."""
        require("health.read")
        return public(await asyncio.to_thread(web.weight_view, days, unit))

    @mcp.tool(annotations=read, meta=auth_meta("health.read"))
    def get_activity(metric: Literal["cal", "steps", "distance", "hr", "workouts", "run"], days: Days = 7) -> dict[str, Any]:
        """Read saved Google Health activity. cal is kcal burned per day; distance/run use meters;
        hr contains hourly Fitbit average/min/max bpm with UTC offsets; workouts from all platforms contain start/end times.
        Missing rows mean missing data, never zero. Original saved rows include fetched
        timestamps; run totals are derived from saved workouts and have no separate fetched timestamp.
        """
        require("health.read")
        cfg, _, _ = web.context("food")
        since = (Clock(cfg.timezone).today() - dt.timedelta(days=days - 1)).isoformat()
        if metric == "cal":
            rows = burned.load(cfg)
        elif metric in activity.METRICS:
            rows = activity.load(cfg, activity.METRICS[metric])
        else:
            rows = workouts.load(cfg)
            if metric == "run":
                rows = workouts.run_days(rows)
        filtered = {key: value for key, value in rows.items()
                    if str(value.get("start", key))[:10] >= since}
        return {"metric": metric, "timezone": cfg.timezone, "since": since, "source": "saved Google Health data", "rows": filtered}

    @mcp.tool(annotations=refresh, meta=auth_meta("health.read"))
    async def refresh_health_data(collection: Literal["food", "weight", "cal", "steps", "distance", "hr", "workouts"], days: Days = 7) -> dict[str, Any]:
        """Pull newer Google data into the local journal, keeping local edits and recovery journals.
        Never pushes or deletes Google records. Choose only the needed collection; hr can be slow.
        """
        require("health.read")
        result = await asyncio.to_thread(web.run, [collection, "pull", "--days", str(days)])
        return {"collection": collection, "days": days, "refreshed": result["code"] == 0,
                "message": "Read the saved data now." if result["code"] == 0 else "Refresh failed. Review the server dashboard; saved data may be stale."}

    @mcp.tool(annotations=write, meta=auth_meta("food.write"))
    async def log_food(
        request_id: UUID, name: Text, kcal: Nonnegative, carbs_g: Nonnegative,
        fat_g: Nonnegative, protein_g: Nonnegative, nutrition_estimated: bool,
        meal: Literal["anytime", "breakfast", "lunch", "dinner", "snack"] = "anytime",
        amount: Positive = 1, unit: Text = "serving", date: str = "today",
        at: Annotated[str | None, Field(pattern=r"^\d{1,2}:\d{2}$")] = None,
        sodium_mg: Nonnegative | None = None,
        note: Annotated[str, Field(max_length=4000)] = "",
    ) -> dict[str, Any]:
        """Log one food to Google Health through the existing journal and sync engine.
        Use only when the user asks to log food. Supply calories AND carbohydrates, fat, protein.
        All values are totals for the portion eaten: amount NEVER multiplies nutrition.
        Preserve supplied numbers; set nutrition_estimated=true when any number is estimated.
        Generate one UUID request_id for this meal and reuse it for every retry with identical arguments.
        date and at use the server's configured timezone. Past dates without a time use noon and are labeled.
        Confirm only status=logged; needs_review is NOT a confirmed Google write. Never blindly retry a needs_review result with a fresh ID.
        """
        require("food.write")
        if any(line.startswith("MCP request:") for line in note.splitlines()):
            raise ValueError("MCP request: is a reserved journal marker; omit it from your note.")
        cfg, _, _ = web.context("food")
        Clock(cfg.timezone).entry_time(date, at)  # Reject invalid dates before claiming a request.
        values = dict(name=name, kcal=kcal, carbs=carbs_g, fat=fat_g, protein=protein_g,
                      meal=meal, amount=amount, unit=unit, date=date,
                      note=(note + "\nNutrition estimated.").strip() if nutrition_estimated else note)
        if at is not None:
            values["at"] = at
        if sodium_mg is not None:
            values["sodium_mg"] = sodium_mg
        return await asyncio.to_thread(log_once, state, str(request_id), values)
