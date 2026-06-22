FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

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
# Next.js evaluates auth-dependent routes while collecting build metadata.
# The dummy auth values are scoped to this build command only and are not
# persisted in the runtime image. Real secrets must be supplied by compose/env.
RUN BETTER_AUTH_SECRET="nexus-build-only-secret-not-used-at-runtime" \
    BETTER_AUTH_URL="http://localhost:3000" \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_COLLABORATION_URL=$NEXT_PUBLIC_COLLABORATION_URL \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED=$NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED \
    NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED=$NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED \
    pnpm build

FROM base AS runner
ENV NODE_ENV=production
# The runtime image is shared by the web, worker and collaboration services
# (compose overrides CMD per service), so the full build output is required.
# Copy with ownership set to the unprivileged `node` user that ships with the
# base image and drop root privileges before running.
COPY --from=builder --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@nexus/web", "start"]
