# syntax=docker/dockerfile:1
#
# Multi-target build. Each production service has its own slim final stage:
#
#   docker build --target web           .   # Next.js standalone server
#   docker build --target worker        .   # Temporal worker (prod deps only)
#   docker build --target collaboration .   # Yjs websocket server (one bundle)
#   docker build --target migrate       .   # drizzle-kit migrations (+ baseline)
#
# All four share the `deps` and `builder` stages, so building them together
# (compose, CI) compiles the monorepo once. The last stage in this file is
# `web`, so a plain `docker build .` still produces the web image.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Pre-fetch the pinned pnpm (packageManager in package.json) into a shared,
# corepack cache owned by the runtime user, so `pnpm` (used only by the migrate
# target at runtime) never downloads anything when a container starts.
ENV COREPACK_HOME="/opt/corepack"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json /tmp/corepack/package.json
RUN corepack enable \
  && cd /tmp/corepack && corepack install \
  && chown -R node:node "$COREPACK_HOME" && rm -rf /tmp/corepack

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/workflows/package.json packages/workflows/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ARG NEXT_PUBLIC_COLLABORATION_URL="ws://localhost:1234"
ARG NEXT_PUBLIC_DEMO_MODE="true"
ARG NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED="false"
ARG NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED="false"
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js evaluates auth-dependent routes while collecting build metadata.
# The dummy auth values are scoped to this build command only and are not
# persisted in any runtime image. Real secrets must be supplied by compose/env.
RUN BETTER_AUTH_SECRET="nexus-build-only-secret-not-used-at-runtime" \
    BETTER_AUTH_URL="http://localhost:3000" \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_COLLABORATION_URL=$NEXT_PUBLIC_COLLABORATION_URL \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED=$NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED \
    NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED=$NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED \
    pnpm build \
  && pnpm --filter @nexus/web build:collab
# Worker runtime tree: @nexus/workflows with production dependencies only
# (Temporal worker, its native core-bridge and the webpack/swc toolchain it
# uses to bundle workflow code at startup). Prebuilt core-bridge binaries for
# other platforms (~110MB) and the Rust sources are dropped.
RUN pnpm --filter @nexus/workflows deploy --prod --legacy /prod/worker \
  && rm -rf /prod/worker/src /prod/worker/tsconfig.json /prod/worker/tsup.config.ts /prod/worker/vitest.config.ts \
  && node -e ' \
    const fs = require("fs"), path = require("path"); \
    const arch = { arm64: "aarch64", x64: "x86_64" }[process.arch]; \
    const keep = arch + "-unknown-linux-gnu"; \
    const store = "/prod/worker/node_modules/.pnpm"; \
    for (const dir of fs.readdirSync(store).filter((d) => d.startsWith("@temporalio+core-bridge@"))) { \
      const pkg = path.join(store, dir, "node_modules/@temporalio/core-bridge"); \
      const releases = path.join(pkg, "releases"); \
      if (!fs.existsSync(path.join(releases, keep))) throw new Error("missing core-bridge build " + keep); \
      for (const r of fs.readdirSync(releases)) if (r !== keep) fs.rmSync(path.join(releases, r), { recursive: true }); \
      for (const extra of ["sdk-core", "src", "bridge-macros", "Cargo.lock", "Cargo.toml"]) fs.rmSync(path.join(pkg, extra), { recursive: true, force: true }); \
      console.log("core-bridge kept", keep); \
    }'

# ---------------------------------------------------------------------------
# migrate: drizzle-kit + SQL migrations + guarded baseline script.
# Usage: docker compose run --rm migrate   (runs `pnpm db:migrate`)
FROM base AS migrate-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/workflows/package.json packages/workflows/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
# Root (for `postgres`, used by the baseline script) and @nexus/database (for
# drizzle-kit, a devDependency) only; the web and worker trees are skipped.
RUN pnpm install --frozen-lockfile --filter nexus --filter @nexus/database

FROM base AS migrate
ENV NODE_ENV=production
COPY --from=migrate-deps --chown=node:node /app /app
COPY --chown=node:node scripts/baseline-drizzle-migrations.mjs scripts/baseline-drizzle-migrations.mjs
COPY --chown=node:node packages/typescript-config packages/typescript-config
COPY --chown=node:node packages/database/drizzle.config.ts packages/database/tsconfig.json packages/database/
COPY --chown=node:node packages/database/drizzle packages/database/drizzle
COPY --chown=node:node packages/database/src packages/database/src
USER node
CMD ["pnpm", "db:migrate"]

# ---------------------------------------------------------------------------
# worker: `node dist/worker.js` (precompiled by tsup; no tsx at runtime).
FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production
WORKDIR /app/packages/workflows
COPY --from=builder --chown=node:node /prod/worker /app/packages/workflows
USER node
CMD ["node", "dist/worker.js"]

# ---------------------------------------------------------------------------
# collaboration: single esbuild bundle, no node_modules.
FROM ${NODE_IMAGE} AS collaboration
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/web/dist-collab /app/dist-collab
USER node
EXPOSE 1234
# Answers any HTTP GET on its port with 200 once Postgres persistence is up.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.COLLABORATION_PORT||1234)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist-collab/collaboration.mjs"]

# ---------------------------------------------------------------------------
# web: Next.js standalone output (traced runtime files only). Last stage, so
# it is also the default target.
FROM ${NODE_IMAGE} AS web
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ARG NEXT_PUBLIC_COLLABORATION_URL="ws://localhost:1234"
ARG NEXT_PUBLIC_DEMO_MODE="true"
ARG NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED="false"
ARG NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED="false"
# NEXT_PUBLIC_* values are inlined into the client bundle at build time; the
# labels let deploy tooling check an image against the server's env file.
LABEL org.nexus.next-public-app-url=$NEXT_PUBLIC_APP_URL \
      org.nexus.next-public-collaboration-url=$NEXT_PUBLIC_COLLABORATION_URL \
      org.nexus.next-public-demo-mode=$NEXT_PUBLIC_DEMO_MODE \
      org.nexus.next-public-public-signup-enabled=$NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED \
      org.nexus.next-public-demo-access-code-required=$NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The standalone server binds to $HOSTNAME; Docker sets HOSTNAME to the
# container id, so pin it to all interfaces.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone /app
COPY --from=builder --chown=node:node /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public /app/apps/web/public
USER node
EXPOSE 3000
# Web health: only the status code matters (anonymous /api/health returns a
# minimal body; 503 only when the app reports itself unhealthy). The slim base
# has no curl, so use node's fetch.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
