"""Exercise the actual HTTP OAuth/MCP handlers and real CLI journal with a fake Google transport."""

import base64
import asyncio
import contextlib
import hashlib
import io
import json
import re
import socket
import threading
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
import uvicorn
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from healthsync import cli, web
from healthsync.google_health import RemoteError
from healthsync_mcp.app import create_app, password_hash, validate_url
from healthsync_mcp.state import State

BASE = "https://health.test"
PASSWORD = "test-owner-password"
CALLBACK = "https://chatgpt.com/connector_platform/oauth/callback"


def hidden(html, name):
    return re.search(f'name="{name}" value="([^"]*)"', html)[1]


class FakeGoogle:
    points = {}
    creates = 0
    fail_uncertain = False

    def __init__(self, binary, record, timezone):
        self.record = record

    def create(self, payload):
        type(self).creates += 1
        eid = str(type(self).creates)
        response = dict(payload, name=f"users/me/dataTypes/nutrition-log/dataPoints/{eid}")
        self.points[eid] = response
        if type(self).fail_uncertain:
            raise RemoteError("Simulated lost response after Google committed", uncertain=True)
        return response

    def get(self, eid):
        return self.points.get(eid)

    def fetch(self, *args, **kwargs):
        return list(self.points.values()) if self.record.kind == "food" else []


@pytest_asyncio.fixture
async def server(tmp_path, monkeypatch):
    monkeypatch.setenv("HSYNC_DATA_DIR", str(tmp_path / "data"))
    config = tmp_path / "config.toml"
    config.write_text('timezone = "America/Los_Angeles"\n')
    monkeypatch.setenv("HSYNC_CONFIG", str(config))
    monkeypatch.setenv("GHEALTH", str(tmp_path / "missing-ghealth"))
    monkeypatch.setattr(web, "SETTINGS", tmp_path / "web.json")
    monkeypatch.setattr(cli, "GoogleHealth", FakeGoogle)
    FakeGoogle.points = {}
    FakeGoogle.creates = 0
    FakeGoogle.fail_uncertain = False

    def run_real_cli(arguments):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = cli.main(arguments)
        return {"code": code, "stdout": out.getvalue(), "stderr": err.getvalue()}

    monkeypatch.setattr(web, "run", run_real_cli)
    salt = "01" * 16
    app = create_app({"public_url": BASE, "salt": salt, "password_hash": password_hash(PASSWORD, salt)}, tmp_path / "state")
    ready, stopped = asyncio.Event(), asyncio.Event()
    async def lifespan_task():
        async with app.router.lifespan_context(app):
            ready.set()
            await stopped.wait()
    task = asyncio.create_task(lifespan_task())
    await ready.wait()
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE) as client:
            yield app, client, tmp_path
    finally:
        stopped.set()
        await task


async def login(client, next_path="/admin"):
    page = await client.get("/login", params={"next": next_path})
    return await client.post("/login", data={"nonce": hidden(page.text, "nonce"), "password": PASSWORD, "next": next_path}, headers={"Origin": BASE})


async def connection(client, scopes="health.read food.write"):
    client.cookies.clear()
    result = await client.post("/register", json={"redirect_uris": [CALLBACK], "client_name": "ChatGPT test", "token_endpoint_auth_method": "none", "scope": scopes})
    assert result.status_code == 201, result.text
    registration = result.json()
    verifier = "v" * 64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    auth = await client.get("/authorize", params={"response_type": "code", "client_id": registration["client_id"], "redirect_uri": CALLBACK,
                                                 "scope": scopes, "state": "test-state", "resource": BASE + "/mcp", "code_challenge": challenge, "code_challenge_method": "S256"})
    assert auth.status_code == 302, auth.text
    ticket_url = auth.headers["location"]
    ticket = parse_qs(urlsplit(ticket_url).query)["ticket"][0]
    assert (await client.get(ticket_url)).status_code == 303  # owner login required
    assert (await login(client)).status_code == 303
    consent = await client.get(ticket_url)
    assert consent.status_code == 200
    response = await client.post("/connect", data={"ticket": ticket, "csrf": hidden(consent.text, "csrf"), "decision": "allow"}, headers={"Origin": BASE})
    assert response.status_code == 303, response.text
    callback = parse_qs(urlsplit(response.headers["location"]).query)
    assert callback["state"] == ["test-state"]
    return registration, verifier, callback["code"][0], ticket


async def tokens(client, scopes="health.read food.write"):
    registration, verifier, code, ticket = await connection(client, scopes)
    data = {"grant_type": "authorization_code", "code": code, "client_id": registration["client_id"], "redirect_uri": CALLBACK,
            "code_verifier": verifier, "resource": BASE + "/mcp"}
    result = await client.post("/token", data=data)
    assert result.status_code == 200, result.text
    return registration, result.json(), data


async def rpc(client, token, method, params=None):
    return await client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
                             headers={"Authorization": "Bearer " + token, "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26"})


def food_args():
    return {"request_id": str(uuid4()), "name": "Test soup", "kcal": 180, "carbs_g": 20, "fat_g": 8,
            "protein_g": 7, "nutrition_estimated": True, "amount": 2, "sodium_mg": 480,
            "note": "Private test note", "date": "2026-09-20"}


async def call(client, token, name, arguments):
    response = await rpc(client, token, "tools/call", {"name": name, "arguments": arguments})
    assert response.status_code == 200, response.text
    return response.json()["result"]


async def test_private_routes_and_discovery(server):
    app, client, _ = server
    for path in ("/", "/admin", "/api/day", "/api/spec"):
        assert (await client.get(path)).status_code in (303, 401)
    response = await client.post("/mcp", json={})
    assert response.status_code == 401
    assert "resource_metadata" in response.headers["www-authenticate"]
    resource = await client.get("/.well-known/oauth-protected-resource/mcp")
    assert resource.json()["resource"] == BASE + "/mcp"
    metadata = (await client.get("/.well-known/oauth-authorization-server")).json()
    assert metadata["code_challenge_methods_supported"] == ["S256"]
    assert metadata["registration_endpoint"] == BASE + "/register"
    assert (await client.get("/admin", headers={"Host": "attacker.example"})).status_code == 400


async def test_oauth_pkce_replay_rotation_durability_and_revocation(server):
    app, client, directory = server
    registration, verifier, code, ticket = await connection(client)
    form = {"grant_type": "authorization_code", "code": code, "client_id": registration["client_id"], "redirect_uri": CALLBACK, "code_verifier": "wrong"}
    assert (await client.post("/token", data=form)).status_code == 400
    form["code_verifier"] = verifier
    form["redirect_uri"] = "https://attacker.example/callback"
    assert (await client.post("/token", data=form)).status_code == 400
    form["redirect_uri"] = CALLBACK
    response = await client.post("/token", data=form)
    assert response.status_code == 200, response.text
    issued = response.json()
    assert (await client.post("/token", data=form)).status_code == 400
    assert (await client.get("/connect", params={"ticket": ticket})).status_code == 400
    reopened = State(directory / "state" / "server.sqlite3")
    assert reopened.get("access", hashlib.sha256(issued["access_token"].encode()).hexdigest())
    raw = (directory / "state" / "server.sqlite3").read_bytes()
    for secret in (issued["access_token"], issued["refresh_token"], code):
        assert secret.encode() not in raw
    assert (await rpc(client, issued["access_token"], "tools/list")).status_code == 200
    refresh = {"grant_type": "refresh_token", "client_id": registration["client_id"], "refresh_token": issued["refresh_token"]}
    response = await client.post("/token", data=refresh)
    assert response.status_code == 200
    rotated = response.json()
    assert response.json()["refresh_token"] != issued["refresh_token"]
    assert (await client.post("/token", data=refresh)).status_code == 400
    admin = await client.get("/admin")
    response = await client.post("/admin/disconnect", data={"csrf": hidden(admin.text, "csrf")}, headers={"Origin": BASE})
    assert response.status_code == 303
    assert (await rpc(client, issued["access_token"], "tools/list")).status_code == 401
    assert (await rpc(client, rotated["access_token"], "tools/list")).status_code == 401


async def test_food_creates_once_preserves_totals_and_private_notes(server):
    app, client, directory = server
    _, issued, _ = await tokens(client)
    args = food_args()
    result = await call(client, issued["access_token"], "log_food", args)
    assert not result.get("isError"), result
    data = result["structuredContent"]
    assert data["status"] == "logged"
    assert data["food"]["kcal"] == 180
    assert data["food"]["protein"] == 7
    assert data["food"]["amount"] == 2
    assert data["food"]["sodium_mg"] == 480
    assert FakeGoogle.creates == 1
    assert (await call(client, issued["access_token"], "log_food", args))["structuredContent"] == data
    assert FakeGoogle.creates == 1
    records = list((directory / "data" / "food").rglob("*.md"))
    assert len(records) == 1
    text = records[0].read_text()
    assert "Nutrition estimated" in text and "Noon is a placeholder" in text
    read = await call(client, issued["access_token"], "get_food_day", {"date": args["date"]})
    assert read["structuredContent"]["totals"]["kcal"] == 180
    assert "Private test note" not in json.dumps(read)
    assert "MCP request" not in json.dumps(read)
    assert '"path"' not in json.dumps(read)
    changed = dict(args, kcal=200)
    assert (await call(client, issued["access_token"], "log_food", changed))["isError"]
    assert FakeGoogle.creates == 1


async def test_uncertain_google_write_is_reconciled_without_duplicate(server):
    app, client, _ = server
    _, issued, _ = await tokens(client)
    FakeGoogle.fail_uncertain = True
    args = food_args()
    failed = await call(client, issued["access_token"], "log_food", args)
    assert failed["structuredContent"]["status"] == "needs_review"
    assert FakeGoogle.creates == 1
    assert (await call(client, issued["access_token"], "log_food", args))["structuredContent"]["status"] == "needs_review"
    assert FakeGoogle.creates == 1
    refreshed = await call(client, issued["access_token"], "refresh_health_data", {"collection": "food", "days": 7})
    assert refreshed["structuredContent"]["refreshed"], refreshed
    recovered = await call(client, issued["access_token"], "log_food", args)
    assert recovered["structuredContent"]["status"] == "logged", recovered
    assert FakeGoogle.creates == 1


async def test_read_only_token_and_invalid_inputs_cannot_write(server):
    app, client, _ = server
    _, issued, _ = await tokens(client, "health.read")
    assert (await call(client, issued["access_token"], "log_food", food_args()))["isError"]
    assert FakeGoogle.creates == 0
    assert not (await call(client, issued["access_token"], "get_food_day", {})).get("isError")


async def test_slow_create_keeps_server_responsive_and_concurrent_retry_does_not_duplicate(server, monkeypatch):
    app, client, _ = server
    _, issued, _ = await tokens(client)
    entered, release = threading.Event(), threading.Event()
    original = FakeGoogle.create
    def slow_create(self, payload):
        entered.set()
        assert release.wait(5)
        return original(self, payload)
    monkeypatch.setattr(FakeGoogle, "create", slow_create)
    args = food_args()
    first = asyncio.create_task(call(client, issued["access_token"], "log_food", args))
    try:
        assert await asyncio.to_thread(entered.wait, 3)
        metadata = await asyncio.wait_for(client.get("/.well-known/oauth-authorization-server"), 1)
        assert metadata.status_code == 200
        second = await asyncio.wait_for(call(client, issued["access_token"], "log_food", args), 1)
        assert second["structuredContent"]["status"] == "needs_review"
    finally:
        release.set()
        result = await first
    assert result["structuredContent"]["status"] == "logged"
    assert FakeGoogle.creates == 1


async def test_official_mcp_client_over_real_http(server):
    app, client, _ = server
    _, issued, _ = await tokens(client)
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    listener.setblocking(False)
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, lifespan="off", access_log=False, log_level="error"))
    task = asyncio.create_task(server.serve(sockets=[listener]))
    try:
        for _ in range(100):
            if server.started:
                break
            await asyncio.sleep(.01)
        assert server.started
        async with httpx.AsyncClient(headers={"Host": "health.test", "Authorization": "Bearer " + issued["access_token"]}, trust_env=False) as network:
            async with streamable_http_client(f"http://127.0.0.1:{port}/mcp", http_client=network) as (read, write, _):
                async with ClientSession(read, write) as session:
                    initialized = await session.initialize()
                    assert initialized.serverInfo.name == "Google Health Sync"
                    tools = await session.list_tools()
                    assert {tool.name for tool in tools.tools} == {"get_food_day", "get_weight_history", "get_activity", "refresh_health_data", "log_food"}
                    result = await session.call_tool("get_food_day", {"date": "today"})
                    assert not result.isError
                    assert result.structuredContent["totals"]["kcal"] == 0
    finally:
        server.should_exit = True
        await task
        listener.close()


async def test_validation_and_csrf(server):
    app, client, _ = server
    page = await client.get("/login")
    bad = await client.post("/login", data={"nonce": hidden(page.text, "nonce"), "password": PASSWORD}, headers={"Origin": "https://attacker.example"})
    assert bad.status_code == 403
    assert (await login(client)).status_code == 303
    assert (await client.post("/api/run", json={}, headers={"Origin": "https://attacker.example"})).status_code == 403
    assert (await client.get("/api/day")).status_code == 200
    assert (await client.post("/admin/disconnect", data={"csrf": "wrong"}, headers={"Origin": BASE})).status_code == 403
    _, issued, _ = await tokens(client)
    for changes in ({"kcal": -1}, {"protein_g": None}, {"amount": 0}, {"at": "99:99"}, {"date": "bad"}, {"request_id": "bad"}):
        assert (await call(client, issued["access_token"], "log_food", dict(food_args(), **changes)))["isError"]
    assert FakeGoogle.creates == 0


@pytest.mark.parametrize("url", ["http://remote.example", "https://host.example/mcp", "https://host.example?secret=1", "https://user:pass@host.example", "https://host.example#fragment"])
def test_reject_bad_public_origin(url):
    with pytest.raises(ValueError):
        validate_url(url)
