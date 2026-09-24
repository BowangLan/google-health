"""Google transport: ghealth owns OAuth and listing; writes use the REST API."""

from __future__ import annotations

import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://health.googleapis.com/v4"
MAX_PAGES = 50


class RemoteError(RuntimeError):
    def __init__(self, message, uncertain=False):
        super().__init__(message)
        self.uncertain = uncertain


def extract_id(response):
    if not isinstance(response, dict):
        return ""
    nodes = (
        response,
        response.get("response") or {},
        response.get("dataPoint") or {},
        (response.get("response") or {}).get("dataPoint") or {},
    )
    for node in nodes:
        if isinstance(node, dict):
            name = node.get("name") or node.get("id")
            # An Operation's name is not a data point identity.
            if name and ("/dataPoints/" in str(name) or "/" not in str(name)):
                return str(name).rsplit("/", 1)[-1]
    return ""


class GoogleHealth:
    def __init__(self, binary, record, timezone="America/Los_Angeles"):
        self.binary = binary
        self.record = record
        self.timezone = timezone
        self.resource = f"users/me/dataTypes/{record.api_type}/dataPoints"
        self.url = f"{BASE}/{self.resource}"
        self._token = None

    def access_token(self):
        if self._token:
            return self._token
        subprocess.run(
            [str(self.binary), "auth", "refresh"], capture_output=True, check=False
        )
        out = subprocess.run(
            [str(self.binary), "auth", "export"],
            capture_output=True,
            text=True,
            check=False,
        )
        if out.returncode:
            raise RemoteError("could not read credentials; run ghealth auth login")
        self._token = json.loads(out.stdout).get("access_token")
        if not self._token:
            raise RemoteError("no access token; run ghealth auth login")
        return self._token

    def request(self, method, url, body=None):
        data = json.dumps(body, allow_nan=False).encode() if body is not None else None
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.access_token()}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                raw = response.read().decode()
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as exc:
            if exc.code == 404 and method == "GET":
                return None
            detail = exc.read().decode()[:1000]
            raise RemoteError(
                f"HTTP {exc.code}: {detail}", uncertain=exc.code >= 500
            ) from None
        except (
            urllib.error.URLError,
            TimeoutError,
            OSError,
            json.JSONDecodeError,
        ) as exc:
            raise RemoteError(str(exc), uncertain=method != "GET") from None

    def fetch(self, since, until="today", limit=500):
        # Explicit offsets prevent the machine timezone from changing day ranges.
        import datetime as dt
        from zoneinfo import ZoneInfo

        zone = ZoneInfo(self.timezone)
        start = dt.datetime.combine(dt.date.fromisoformat(since), dt.time(), zone)
        end_day = (
            dt.datetime.now(zone).date()
            if until == "today"
            else dt.date.fromisoformat(until)
        )
        end = dt.datetime.combine(end_day + dt.timedelta(days=1), dt.time(), zone)
        filter_name = self.record.api_type.replace("-", "_")
        if self.record.kind == "food":
            # Nutrition is filtered by civil dates, exactly like ghealth's
            # --from/--to flags. Physical samples require UTC with a Z suffix.
            field = f"{filter_name}.interval.civil_start_time"
            lower, upper = start.date().isoformat(), end.date().isoformat()
        else:
            field = f"{filter_name}.sample_time.physical_time"
            lower = start.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            upper = end.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        query = f'{field} >= "{lower}" AND {field} < "{upper}"'
        cmd = [
            str(self.binary),
            "data",
            self.record.api_type,
            "list",
            "--filter",
            query,
            "--raw",
            "--limit",
            str(limit),
        ]
        points, token, seen = [], "", set()
        for _ in range(MAX_PAGES):
            out = subprocess.run(
                cmd + (["--page-token", token] if token else []),
                capture_output=True,
                text=True,
                check=False,
            )
            if out.returncode:
                raise RemoteError(
                    f"fetch failed: {out.stderr.strip() or out.stdout.strip()}"
                )
            payload = json.loads(out.stdout)
            if not isinstance(payload, dict) or not isinstance(
                payload.get("dataPoints", []), list
            ):
                raise RemoteError(
                    "invalid list response; refusing an incomplete snapshot"
                )
            points.extend(payload.get("dataPoints", []))
            token = payload.get("nextPageToken") or ""
            if not token:
                return points
            if token in seen:
                raise RemoteError(
                    "repeated page token; refusing an incomplete snapshot"
                )
            seen.add(token)
        raise RemoteError(f"more than {MAX_PAGES} pages; narrow the date range")

    def get(self, eid):
        return self.request(
            "GET", f"{self.url}/{urllib.parse.quote(str(eid), safe='')}"
        )

    def finish(self, response):
        # Mutations may return a long-running Operation. Do not replay one
        # whose completion is uncertain; the journal retains the response.
        if response.get("error"):
            raise RemoteError(json.dumps(response["error"]), uncertain=True)
        name = str(response.get("name", ""))
        if (
            name.startswith("operations/") or "/operations/" in name
        ) and not response.get("done"):
            raise RemoteError(
                f"operation pending: {response['name']}; pull to reconcile",
                uncertain=True,
            )
        return response

    def create(self, payload):
        return self.finish(self.request("POST", self.url, payload))

    def update(self, eid, payload):
        return self.finish(
            self.request(
                "PATCH", f"{self.url}/{urllib.parse.quote(str(eid), safe='')}", payload
            )
        )

    def delete(self, ids):
        return self.finish(
            self.request(
                "POST",
                f"{self.url}:batchDelete",
                {"names": [f"{self.resource}/{eid}" for eid in ids]},
            )
        )
