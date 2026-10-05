"""ASGI gateway: OAuth MCP, owner account pages, and the existing dashboard."""

import argparse
import asyncio
import getpass
import hashlib
import json
import os
import secrets
import subprocess
import threading
import time
from contextlib import asynccontextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import httpx
import uvicorn
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import RequestBodyLimitMiddleware, TransportSecuritySettings
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from starlette.routing import Route

from healthsync import web
from healthsync.config import resolve

from . import pages
from .auth import OwnerOAuth, SCOPES
from .state import State, digest
from .tools import register_tools


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def validate_url(value):
    parsed = urlsplit(value)
    if (not parsed.hostname or parsed.username or parsed.password or parsed.query or
            parsed.fragment or parsed.path not in ("", "/") or
            not (parsed.scheme == "https" or parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1"))):
        raise ValueError("Use an HTTPS origin without a path, or HTTP localhost for development.")
    return value.rstrip("/")


def safe_next(value):
    if value == "/" or value == "/admin" or value.startswith("/connect?ticket="):
        return value
    return "/admin"


def create_app(settings, state_dir):
    base = validate_url(settings["public_url"])
    secure = base.startswith("https://")
    state = State(Path(state_dir) / "server.sqlite3")
    oauth = OwnerOAuth(state, base)
    mcp = FastMCP(
        "Google Health Sync", stateless_http=True, json_response=True,
        instructions="Personal Google Health journal. Read saved data or refresh before reading. Log food only on the user's request; preserve numbers, label estimates, and reuse a UUID for retries.",
        auth_server_provider=oauth,
        auth=AuthSettings(issuer_url=base, resource_server_url=base + "/mcp", validate_token_resource=True,
                          required_scopes=[], client_registration_options=ClientRegistrationOptions(
                              enabled=True, valid_scopes=SCOPES, default_scopes=SCOPES),
                          revocation_options=RevocationOptions(enabled=True)),
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[urlsplit(base).netloc], allowed_origins=[base],
        ),
    )
    register_tools(mcp, state)
    mcp_app = mcp.streamable_http_app()

    # Keep the original dashboard HTTP adapter unchanged and private on loopback.
    @asynccontextmanager
    async def lifespan(app):
        class QuietHandler(web.Handler):
            def log_message(self, fmt, *args):
                pass
        local = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        worker = threading.Thread(target=local.serve_forever, daemon=True)
        worker.start()
        app.state.dashboard_url = f"http://127.0.0.1:{local.server_port}"
        try:
            async with httpx.AsyncClient(timeout=web.TIMEOUT + 10, trust_env=False) as client:
                app.state.dashboard_client = client
                async with mcp.session_manager.run():
                    yield
        finally:
            await asyncio.to_thread(local.shutdown)
            local.server_close()
            worker.join(timeout=5)

    def session(request):
        return state.get("session", digest(request.cookies.get("hsync_owner", "")))

    def owner_redirect(request):
        return RedirectResponse("/login?" + urlencode({"next": safe_next(request.url.path + ("?" + request.url.query if request.url.query else ""))}), status_code=303)

    def same_origin(request):
        return request.headers.get("origin") == base

    def csrf_ok(request, form, owner):
        return same_origin(request) and owner is not None and secrets.compare_digest(str(form.get("csrf", "")), owner["csrf"])

    def login_page(next_path, error="", status=200):
        nonce = secrets.token_urlsafe(32)
        state.put("login", digest(nonce), {}, time.time() + 600)
        response = HTMLResponse(pages.login(nonce, safe_next(next_path), error), status_code=status)
        response.set_cookie("hsync_login", nonce, secure=secure, httponly=True, samesite="lax", max_age=600)
        return response

    async def login(request):
        if request.method == "GET":
            return login_page(request.query_params.get("next", "/admin"))
        form = await request.form()
        nonce = str(form.get("nonce", ""))
        if (not same_origin(request) or not nonce or
                not secrets.compare_digest(nonce, request.cookies.get("hsync_login", "")) or
                state.get("login", digest(nonce), consume=True) is None):
            return HTMLResponse(pages.page("Sign-in expired", "<p>Return to the sign-in page and try again.</p>"), status_code=403)
        peer = digest(request.client.host if request.client else "unknown")
        with state.transaction() as db:
            attempts = state.get("attempt", peer, db=db) or {"count": 0, "until": time.time() + 600}
            attempts["count"] += 1
            state.put("attempt", peer, attempts, attempts["until"], db)
        if attempts["count"] > 10:
            return login_page("/admin", "Too many attempts. Try again in ten minutes.", 429)
        password = str(form.get("password", ""))
        if len(password) > 1024 or not secrets.compare_digest(password_hash(password, settings["salt"]), settings["password_hash"]):
            return login_page(str(form.get("next", "/admin")), "Incorrect password.", 401)
        token = secrets.token_urlsafe(32)
        state.put("session", digest(token), {"csrf": secrets.token_urlsafe(32)}, time.time() + 43200)
        response = RedirectResponse(safe_next(str(form.get("next", "/admin"))), status_code=303)
        response.set_cookie("hsync_owner", token, secure=secure, httponly=True, samesite="lax", max_age=43200)
        response.delete_cookie("hsync_login", secure=secure, httponly=True, samesite="lax")
        return response

    async def connect(request):
        owner = session(request)
        if owner is None:
            return owner_redirect(request)
        form = await request.form() if request.method == "POST" else request.query_params
        ticket = str(form.get("ticket", ""))
        pending = oauth.consent(ticket)
        if pending is None:
            return HTMLResponse(pages.page("Request expired", "<p>Start the connection again in ChatGPT.</p>"), status_code=400)
        if request.method == "POST":
            if not csrf_ok(request, form, owner) or form.get("decision") not in ("allow", "deny"):
                return Response(status_code=403)
            try:
                return RedirectResponse(oauth.approve(ticket, form["decision"] == "allow"), status_code=303)
            except ValueError:
                return Response("Connection request already used or expired.", status_code=400)
        client = await oauth.get_client(pending["client_id"])
        return HTMLResponse(pages.consent(client.client_name or "MCP client", pending["params"]["redirect_uri"], pending["params"]["scopes"], ticket, owner["csrf"]))

    async def admin(request):
        owner = session(request)
        if owner is None:
            return owner_redirect(request)
        def google_status():
            try:
                cfg = resolve(argparse.Namespace(), "food")
                result = subprocess.run([str(cfg.ghealth), "auth", "status"], capture_output=True, text=True, timeout=10)
                value = json.loads(result.stdout) if result.returncode == 0 else {}
                scopes = value.get("scopes") or []
                label = "Local Google credentials present (not checked with Google)." if value.get("authenticated") else "Google login needs setup or renewal."
                return label, scopes if isinstance(scopes, list) else str(scopes).split()
            except (OSError, ValueError, subprocess.TimeoutExpired):
                return "Google login needs setup or renewal.", []
        label, scopes = await asyncio.to_thread(google_status)
        return HTMLResponse(pages.admin(base + "/mcp", owner["csrf"], state.count("access"), label, scopes))

    async def owner_action(request):
        owner = session(request)
        form = await request.form()
        if not csrf_ok(request, form, owner):
            return Response(status_code=403)
        if request.url.path == "/admin/disconnect":
            oauth.disconnect_all()
            return RedirectResponse("/admin", status_code=303)
        state.get("session", digest(request.cookies.get("hsync_owner", "")), consume=True)
        response = RedirectResponse("/login", status_code=303)
        response.delete_cookie("hsync_owner", secure=secure, httponly=True, samesite="lax")
        return response

    async def dashboard(request):
        if session(request) is None:
            return JSONResponse({"error": "Owner sign-in required"}, status_code=401) if request.url.path.startswith("/api/") else owner_redirect(request)
        if request.method not in ("GET", "HEAD") and not same_origin(request):
            return Response(status_code=403)
        # Client input never selects the proxy host or forwards cookies/credentials.
        target = request.url.path + ("?" + request.url.query if request.url.query else "")
        response = await request.app.state.dashboard_client.request(
            request.method, request.app.state.dashboard_url + target,
            content=await request.body(), headers={"Content-Type": request.headers.get("content-type", "application/json")},
        )
        return Response(response.content, status_code=response.status_code,
                        headers={"Content-Type": response.headers.get("content-type", "application/octet-stream")})

    # SDK routes include discovery, DCR, token exchange, revocation, and /mcp.
    app = Starlette(routes=[
        Route("/login", login, methods=["GET", "POST"]),
        Route("/connect", connect, methods=["GET", "POST"]),
        Route("/admin", admin),
        Route("/logout", owner_action, methods=["POST"]),
        Route("/admin/disconnect", owner_action, methods=["POST"]),
        *mcp_app.routes,
        Route("/{path:path}", dashboard, methods=["GET", "HEAD", "POST", "PATCH", "DELETE"]),
    ], lifespan=lifespan)
    # Preserve SDK bearer authentication middleware when composing its routes.
    for middleware in reversed(mcp_app.user_middleware):
        app.add_middleware(middleware.cls, *middleware.args, **middleware.kwargs)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=[urlsplit(base).hostname])
    app.add_middleware(RequestBodyLimitMiddleware, max_body_size=1024 * 1024)

    async def private_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.update({"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                                 "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY"})
        if request.url.path in ("/login", "/connect", "/admin"):
            # The consent form returns to an external, registered OAuth callback.
            response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
        if secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response

    app.add_middleware(BaseHTTPMiddleware, dispatch=private_headers)

    app.state.oauth = oauth
    app.state.store = state
    app.state.mcp = mcp
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("init", "serve"), default="serve")
    parser.add_argument("--url", help="Public HTTPS origin; HTTP localhost allowed for development")
    parser.add_argument("--state-dir", default=os.getenv("HSYNC_SERVER_STATE"))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8790)
    args = parser.parse_args()
    cfg = resolve(argparse.Namespace(), "food")
    directory = Path(args.state_dir).expanduser() if args.state_dir else cfg.directory.parent / ".server"
    config = directory / "server.json"
    if args.action == "init":
        if not args.url:
            parser.error("init requires --url")
        if config.exists():
            parser.error(f"Server already configured at {config}; initialization will not overwrite it.")
        url = validate_url(args.url)
        password = getpass.getpass("Owner password (at least 16 characters): ")
        if len(password) < 16 or len(password) > 1024:
            parser.error("Use a password between 16 and 1024 characters")
        if password != getpass.getpass("Repeat password: "):
            parser.error("Passwords do not match")
        salt = secrets.token_hex(16)
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Exclusive create and restrictive mode before any password-derived data is written.
        with os.fdopen(os.open(config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as stream:
            json.dump({"public_url": url, "salt": salt, "password_hash": password_hash(password, salt)}, stream)
        print(f"Configured. Admin: {url}/admin\nMCP URL: {url}/mcp")
        return
    if not config.is_file():
        parser.error("Run hsync-server init --url https://your-host.example first")
    app = create_app(json.loads(config.read_text()), directory)
    # Disable access logs: OAuth authorization codes and consent tickets occur in URLs.
    uvicorn.run(app, host=args.host, port=args.port, access_log=False)
