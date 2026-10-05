"""Small server-rendered account pages using the existing dashboard palette."""

from html import escape


def page(title, content):
    return f"""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)} · Google Health Sync</title>
<style>
:root{{color-scheme:dark;--canvas:#09090b;--surface:#111113;--text:#f4f4f5;--muted:#a8a8b0;--hair:#333338}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--canvas);color:var(--text);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
main{{max-width:680px;margin:0 auto;padding:48px 24px;min-height:100dvh}}nav{{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:48px}}
a{{color:var(--text)}}h1{{font-size:32px;line-height:1.2;letter-spacing:-.03em}}h2{{font-size:19px;margin-top:36px}}
p,li{{color:var(--muted)}}section{{padding:20px 0;border-bottom:1px solid var(--hair)}}label{{display:block;margin:16px 0 8px}}
input,button{{font:inherit;border-radius:12px;padding:12px 16px}}input{{display:block;width:100%;background:var(--surface);color:var(--text);border:1px solid var(--hair)}}
button{{border:1px solid var(--hair);background:#fafafa;color:#09090b;cursor:pointer;margin:16px 8px 0 0}}button.secondary{{background:var(--surface);color:var(--text)}}
input:focus-visible,button:focus-visible,a:focus-visible{{outline:2px solid #64d2ff;outline-offset:4px}}code{{overflow-wrap:anywhere;color:var(--text)}}
.error{{color:#ff6961}}.status{{color:#64d2ff}}.link{{padding:16px;border:1px solid var(--hair);border-radius:12px;background:var(--surface);user-select:all}}
@media(max-width:480px){{main{{padding:28px 20px}}h1{{font-size:28px}}}}
</style><main><nav><a href="/">Dashboard</a><a href="/admin">Connections</a></nav>
<h1>{escape(title)}</h1>{content}</main></html>"""


def hidden(name, value):
    return f'<input type="hidden" name="{escape(name)}" value="{escape(value, quote=True)}">'


def login(nonce, next_path, error=""):
    return page("Sign in to your server", f"""
<p>Use the owner password created during server setup.</p>
<p class="error" role="alert">{escape(error)}</p>
<form method="post" action="/login">{hidden('nonce', nonce)}{hidden('next', next_path)}
<label for="password">Owner password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024" autofocus>
<button>Sign in</button></form>""")


def consent(name, callback, scopes, ticket, csrf):
    permissions = "".join(f"<li>{escape({'health.read': 'Read saved health data and refresh it from Google.', 'food.write': 'Create food logs in your Google Health account.'}[scope])}</li>" for scope in scopes)
    return page("Allow this connection?", f"""
<p><strong>{escape(name)}</strong> is asking to connect to this account.</p>
<p>Only approve if you started this request. Client names are supplied by the requesting app.</p>
<p>Return address: <code>{escape(callback)}</code></p><ul>{permissions}</ul>
<p>Google credentials and private journal notes stay on your server.</p>
<form method="post" action="/connect">{hidden('ticket', ticket)}{hidden('csrf', csrf)}
<button name="decision" value="allow">Allow connection</button>
<button class="secondary" name="decision" value="deny">Cancel</button></form>""")


def admin(url, csrf, connections, google_status, scopes):
    scope_text = ", ".join(scopes) or "No scopes reported"
    return page("Your ChatGPT connection", f"""
<p>This instance serves one Google account. Its dashboard and MCP use the same food journal.</p>
<section><h2>MCP URL</h2><p class="link"><code>{escape(url)}</code></p>
<p>Select and copy this URL. It contains no credentials.</p>
<ol><li>Enable Developer mode in ChatGPT settings.</li>
<li>Create a custom MCP connection using this URL and OAuth authentication.</li>
<li>Sign in here and approve the requested permissions.</li>
<li>Select the connection in a chat and ask ChatGPT to log food.</li></ol>
<p><a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" rel="noreferrer">Current ChatGPT setup instructions</a></p>
<p>Use a public HTTPS address. Localhost is for local testing. Availability depends on your ChatGPT account and workspace settings.</p></section>
<section><h2>Google Health</h2><p class="status">{escape(google_status)}</p>
<p>Granted scopes: <code>{escape(scope_text)}</code></p>
<p>Connect or renew Google login on the host with <code>uv run hsync auth</code>.
The Google desktop login flow runs on your host. MCP authorization is separate.</p></section>
<section><h2>Access</h2><p>{connections} active access token(s). Tokens expire after one hour; refresh access lasts 30 days.</p>
<form method="post" action="/admin/disconnect">{hidden('csrf', csrf)}<button class="secondary">Disconnect all MCP clients</button></form>
<p>Disconnecting revokes MCP access immediately. It preserves your Google login and journal.</p></section>
<form method="post" action="/logout">{hidden('csrf', csrf)}<button class="secondary">Sign out</button></form>""")
