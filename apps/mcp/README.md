# Self-hosted Google Health MCP

One self-hosted instance serves one Google account. It exposes the existing React
dashboard at `/`, owner administration at `/admin`, and OAuth-protected MCP at
`/mcp`. Every user runs a separate instance and receives a URL for their own domain.
There is no hosted account service or OpenAI API key requirement.

The MCP server uses the [official Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk/tree/v1.x)'s Streamable HTTP transport and
OAuth handlers. Owner consent grants `health.read` and/or `food.write`. Tokens are
short-lived, scoped, bound to this instance's MCP URL, and stored as hashes in
SQLite. Authorization codes are single-use; PKCE is required. Refresh tokens rotate.
The Google login and refresh tokens stay with `ghealth` on the server. They are
never passed to ChatGPT. Reads omit private Markdown bodies and host file paths.

## Run on your own host

1. Complete the repo's [Google setup](../../README.md#setup-and-authorization).
   It currently uses a Google **Desktop app** OAuth client and a local login
   callback. Use a machine with a browser for this step. Do not run the wizard
   expecting a web-based Google consent page from this server.
2. Build the existing dashboard, then initialize and run the server:

   ```sh
   bun install
   bun run build
   uv run --project apps/mcp hsync-server init --url https://health.example.com
   uv run --project apps/mcp hsync-server serve
   ```

   Initialization asks for a password of at least 16 characters. It stores a
   salted scrypt password hash, never the password. The URL is printed immediately
   and shown at `/admin`. The default listener is `127.0.0.1:8790`; place an HTTPS
   reverse proxy in front of it that preserves the public Host header.
3. Sign in at `https://health.example.com/admin`, copy the MCP URL, and configure
   ChatGPT as described below.

For local protocol development, use `--url http://127.0.0.1:8790` during init.
ChatGPT cannot reach your machine's localhost. Use your own public HTTPS origin
for ChatGPT. To use a different origin later, stop the server, update
`data/.server/server.json`'s `public_url`, restart, and create a new ChatGPT
connection. Previously issued tokens are bound to the old MCP URL and rejected.

Server credentials, OAuth state, browser sessions, and food request receipts live
in `data/.server/`, which is inside the repo's ignored data directory. Override
with `--state-dir` or `HSYNC_SERVER_STATE`; keep that directory private and outside
version control. `HSYNC_CONFIG`, `HSYNC_DATA_DIR`, and `GHEALTH` work as in the CLI.
If you use a custom data directory, preserve its complete indexes and recovery journals.

## Docker Compose with automatic HTTPS

The image builds Google's CLI from `vendor/google-health-cli` created by the
existing setup workflow. Its build context excludes credentials and health records.
Docker does not perform a Google login or upload any of your records during build.

1. Complete Google setup on your machine. Copy the entire `ghealth` configuration
   directory to the server securely if it is a different machine. It contains
   secrets and must be writable for token refresh. If moving an existing journal,
   copy the entire data directory, including hidden indexes and journals.
2. Copy `apps/mcp/server.env.example` to `apps/mcp/server.env`. Set the hostname and
   **absolute** data and credential directory paths. Set UID and GID to the user
   who owns those directories and the mounted TOML file (`id -u` and `id -g`).
   Make both directories before starting Docker.
   Edit `health.example.toml` if you want a different timezone or weight unit.
3. Point the hostname's DNS record at your server and allow ports 80 and 443.
4. Build and initialize:

   ```sh
   docker compose --env-file apps/mcp/server.env -f apps/mcp/compose.yaml build
   docker compose --env-file apps/mcp/server.env -f apps/mcp/compose.yaml run --rm health init --url https://health.example.com
   docker compose --env-file apps/mcp/server.env -f apps/mcp/compose.yaml up -d
   ```

The app port is private to Docker; Caddy serves HTTPS. Both health data and OAuth
state persist in your data directory. The image runs as an unprivileged user.
The React dashboard's display preferences currently live in the app container;
food/weight records and MCP state persist, but dashboard display preferences reset
when the container is replaced.

## Connect from ChatGPT

Follow [OpenAI's current connection instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt).
Enable Developer mode, create a custom remote MCP connection with
`https://health.example.com/mcp`, and choose OAuth authentication. The server
supports dynamic client registration, so the user does not need to manually issue
or copy a token. Sign in to your server and approve the requesting app's permissions.
Select the connection in the conversation before asking it to log food.
ChatGPT account and workspace controls determine availability; this server cannot
enable those controls for you. Menu names may change.

Example prompt:

> Log lunch today: chicken burrito, 650 kcal, 72 g carbohydrates, 24 g fat,
> 38 g protein. Those are estimates.

The MCP tools are:

| Tool | Behavior | Permission |
| --- | --- | --- |
| `get_food_day` | Saved food and totals for a local date, including sync state | `health.read` |
| `get_weight_history` | Saved measurements over 1–90 days, with explicit kg/lb units | `health.read` |
| `get_activity` | Saved calories burned, steps, distance, hourly heart rate, workouts, run distance | `health.read` |
| `refresh_health_data` | Pull one collection, preserving local edits; never push | `health.read` |
| `log_food` | Create one local food file and push only that food | `food.write` |

Food writes require calories, carbohydrate, fat, protein, and an explicit estimate
flag. Numbers are totals for the eaten portion, even when amount exceeds one.
Dates use the configured timezone; an earlier date without a time uses noon and
stores a placeholder note. Request IDs are UUIDs: reuse the same ID and arguments
for retries, and use a fresh ID for each intentional additional meal.
Only a `logged` result confirms a Google write. `needs_review` requires reconciliation:
pull food, inspect the journal and recovery state, then check the same request ID.
The server never automatically replays an uncertain create.

## Operations and limits

- `/admin` can immediately disconnect all MCP clients without deleting health records
  or removing Google login. Browser sign-out revokes that browser session only.
- Access tokens last one hour; refresh tokens last 30 days. Consent is explicit and
  permissions are checked per tool. The URL contains no secret and does not grant access.
- Google OAuth Testing-mode token expiry and Google API scope requirements still
  apply. Renew Google authorization with the existing CLI when needed.
- MCP reads use the saved journal. Refresh explicitly for current Google data;
  missing device rows represent missing measurements, not zero. Heart rate uses
  Fitbit records; workouts include all platforms, including Apple Watch. Run totals
  aggregate saved workouts and count separate device records separately.
- Back up the complete data directory and Google credentials securely. Do not delete
  SQLite receipts or sync journals to retry uncertain operations.
- Run one server process per account/data directory. Separate instances must use
  separate journals, server state, and Google credential directories. This is not
  a multi-user shared host or a horizontal scaling design.
- HTTPS is required outside loopback. Proxy access logs should omit OAuth query
  strings. The included proxy and app do not enable access logging.
- A food write can still fail because Google authorization expired, a file lock is
  held by another process, or Google returned an error. The dashboard is the owner's
  review surface; no force-push, deletion, or arbitrary CLI tool is exposed through MCP.

## Development checks

```sh
uv run --project apps/mcp --group dev python -m pytest apps/mcp/tests -q
uv run python -m unittest discover -s apps/cli/tests
```

The MCP tests use temporary journals, real HTTP OAuth handlers, and the real CLI
sync engine with a simulated Google transport. They never contact your Google account.
End-to-end ChatGPT verification still needs a deployed HTTPS instance, an eligible
ChatGPT account, and your consent to a real food entry.
