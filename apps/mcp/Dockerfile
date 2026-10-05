FROM golang:1.26-bookworm AS google-cli
WORKDIR /src
# Use the Google CLI source installed by the repo's existing setup workflow.
COPY vendor/google-health-cli/go.mod vendor/google-health-cli/go.sum ./
RUN go mod download
COPY vendor/google-health-cli/main.go ./
COPY vendor/google-health-cli/cmd ./cmd
COPY vendor/google-health-cli/internal ./internal
COPY vendor/google-health-cli/pkg ./pkg
RUN CGO_ENABLED=0 go build -o /ghealth .

FROM oven/bun:1.3.14 AS dashboard
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY apps/web ./apps/web
COPY apps/cli/package.json ./apps/cli/package.json
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/web build

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS server
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 health
COPY apps/cli/pyproject.toml ./apps/cli/pyproject.toml
COPY apps/cli/src ./apps/cli/src
COPY apps/mcp/pyproject.toml ./apps/mcp/pyproject.toml
COPY apps/mcp/src ./apps/mcp/src
# Editable installs preserve healthsync's repository-relative dashboard paths.
RUN uv pip install --system --editable ./apps/cli --editable ./apps/mcp
COPY --from=google-cli /ghealth /usr/local/bin/ghealth
COPY --from=dashboard /app/apps/web/dist ./apps/web/dist
RUN chmod -R a+rX /app \
    && mkdir -p /data /credentials && chown health:health /data /credentials /app
ENV HSYNC_DATA_DIR=/data GHEALTH=/usr/local/bin/ghealth GHEALTH_CONFIG_DIR=/credentials
USER health
EXPOSE 8790
ENTRYPOINT ["hsync-server"]
CMD ["serve", "--host", "0.0.0.0", "--port", "8790"]
