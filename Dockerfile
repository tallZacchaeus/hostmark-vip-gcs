# syntax=docker/dockerfile:1
# Production image for the DigitalOcean droplet. Built and run by compose.yaml.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Dependencies (cached separately from source changes).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Build, and the "tools" target used for one-off scripts (admin:create, db:seed).
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Minimal runtime: the standalone server only, as a non-root user.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# Standalone output leaves out public/ (logo, favicon, images); the server serves it from here.
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["node", "server.js"]
