"""SDK-managed OAuth 2.1 with owner consent, PKCE, and durable opaque tokens."""

import json
import secrets
import time
from urllib.parse import urlsplit

from mcp.server.auth.provider import (
    AccessToken, AuthorizationCode, AuthorizationParams, AuthorizeError,
    RefreshToken, RegistrationError, TokenError, construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

from .state import digest

SCOPES = ["health.read", "food.write"]
ACCESS_SECONDS = 3600
REFRESH_SECONDS = 30 * 86400


class OwnerOAuth:
    def __init__(self, state, base_url):
        self.state = state
        self.base_url = base_url
        self.resource = base_url + "/mcp"

    async def get_client(self, client_id):
        value = self.state.get("client", client_id)
        return OAuthClientInformationFull.model_validate(value) if value else None

    async def register_client(self, client_info):
        # Never fetch a registered URL. Registration alone confers no data access.
        for uri in client_info.redirect_uris or []:
            parsed = urlsplit(str(uri))
            if (parsed.username or parsed.password or parsed.fragment or
                    not parsed.hostname or not (
                        parsed.scheme == "https" or
                        parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost", "::1")
                    )):
                raise RegistrationError("invalid_redirect_uri", "Use HTTPS or a loopback callback.")
        if not set((client_info.scope or "").split()) <= set(SCOPES):
            raise RegistrationError("invalid_client_metadata", "Unknown scope.")
        # Bound unauthenticated registration storage; active registrations persist.
        if self.state.count("client") >= 1000:
            raise RegistrationError("invalid_client_metadata", "Registration limit reached; contact the owner.")
        self.state.put("client", client_info.client_id, client_info.model_dump(mode="json"))

    async def authorize(self, client, params: AuthorizationParams):
        if params.resource not in (None, self.resource):
            raise AuthorizeError("invalid_request", "This server only issues tokens for its MCP URL.")
        scopes = params.scopes or ["health.read"]
        if not set(scopes) <= set(SCOPES):
            raise AuthorizeError("invalid_scope", "Unknown scope.")
        ticket = secrets.token_urlsafe(32)
        self.state.put("consent", digest(ticket), {
            "client_id": client.client_id,
            "params": params.model_copy(update={"scopes": scopes, "resource": self.resource}).model_dump(mode="json"),
        }, time.time() + 600)
        return self.base_url + "/connect?ticket=" + ticket

    def consent(self, ticket):
        return self.state.get("consent", digest(ticket))

    def approve(self, ticket, allow):
        with self.state.transaction() as db:
            pending = self.state.get("consent", digest(ticket), consume=True, db=db)
            if pending is None:
                raise ValueError("This connection request expired. Start again in ChatGPT.")
            params = AuthorizationParams.model_validate(pending["params"])
            if not allow:
                return construct_redirect_uri(str(params.redirect_uri), error="access_denied", state=params.state)
            code = secrets.token_urlsafe(32)
            record = AuthorizationCode(
                code="", client_id=pending["client_id"], expires_at=time.time() + 300,
                subject="owner", **params.model_dump(exclude={"state"}),
            )
            self.state.put("code", digest(code), record.model_dump(mode="json"), record.expires_at, db)
            return construct_redirect_uri(str(params.redirect_uri), code=code, state=params.state)

    async def load_authorization_code(self, client, authorization_code):
        record = self.state.get("code", digest(authorization_code))
        if record is None or record["client_id"] != client.client_id:
            return None
        return AuthorizationCode.model_validate(dict(record, code=authorization_code))

    def issue(self, client_id, scopes, db):
        access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        now = int(time.time())
        base = dict(client_id=client_id, scopes=scopes, resource=self.resource, subject="owner")
        self.state.put("access", digest(access), dict(base, expires_at=now + ACCESS_SECONDS), now + ACCESS_SECONDS, db)
        self.state.put("refresh", digest(refresh), dict(base, expires_at=now + REFRESH_SECONDS), now + REFRESH_SECONDS, db)
        return OAuthToken(access_token=access, refresh_token=refresh, expires_in=ACCESS_SECONDS, scope=" ".join(scopes))

    async def exchange_authorization_code(self, client, authorization_code):
        with self.state.transaction() as db:
            saved = self.state.get("code", digest(authorization_code.code), consume=True, db=db)
            if saved is None or saved["client_id"] != client.client_id:
                raise TokenError("invalid_grant", "Code expired or already used.")
            return self.issue(client.client_id, saved["scopes"], db)

    async def load_refresh_token(self, client, refresh_token):
        record = self.state.get("refresh", digest(refresh_token))
        if record is None or record["client_id"] != client.client_id:
            return None
        return RefreshToken.model_validate(dict(record, token=refresh_token))

    async def exchange_refresh_token(self, client, refresh_token, scopes):
        with self.state.transaction() as db:
            saved = self.state.get("refresh", digest(refresh_token.token), consume=True, db=db)
            if saved is None or saved["client_id"] != client.client_id:
                raise TokenError("invalid_grant", "Refresh token expired or already used.")
            if not set(scopes) <= set(saved["scopes"]):
                raise TokenError("invalid_scope", "Cannot expand granted scopes.")
            return self.issue(client.client_id, scopes, db)

    async def load_access_token(self, token):
        record = self.state.get("access", digest(token))
        if record is None or record["resource"] != self.resource:
            return None
        return AccessToken.model_validate(dict(record, token=token))

    async def revoke_token(self, token):
        # Revoke every token for this client, including previous access tokens.
        with self.state.transaction() as db:
            for kind in ("access", "refresh", "code", "consent"):
                rows = db.execute("SELECT key,body FROM state WHERE kind=?", (kind,)).fetchall()
                for key, body in rows:
                    if json.loads(body)["client_id"] == token.client_id:
                        db.execute("DELETE FROM state WHERE kind=? AND key=?", (kind, key))

    def disconnect_all(self):
        self.state.clear(("access", "refresh", "code", "consent"))
