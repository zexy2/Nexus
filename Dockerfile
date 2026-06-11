FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/agents/package.json packages/agents/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/workflows/package.json packages/workflows/package.json
COPY packages/zero-schema/package.json packages/zero-schema/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm build

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
