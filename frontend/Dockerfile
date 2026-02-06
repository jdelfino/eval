# Multi-stage Dockerfile for the Next.js frontend.
#
# Build context is the REPO ROOT:
#   docker build -f frontend/Dockerfile .
#
# Runtime env vars (NEXT_PUBLIC_*) are injected at container start
# via docker-entrypoint.sh, which replaces placeholder strings baked
# into the JS at build time.

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: Build the Next.js application
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ .

# Placeholder values baked into JS at build time.
# The entrypoint script replaces these with real env vars at container start.
ENV NEXT_PUBLIC_API_URL=__NEXT_PUBLIC_API_URL__
ENV NEXT_PUBLIC_FIREBASE_API_KEY=__NEXT_PUBLIC_FIREBASE_API_KEY__
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=__NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN__
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=__NEXT_PUBLIC_FIREBASE_PROJECT_ID__
ENV NEXT_PUBLIC_CENTRIFUGO_URL=__NEXT_PUBLIC_CENTRIFUGO_URL__

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: Production runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone server and static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public assets if they exist (using a wildcard so the build
# does not fail when the directory is absent)
COPY --from=builder --chown=nextjs:nodejs /app/public* ./public/

# Copy the entrypoint script
COPY --chown=nextjs:nodejs frontend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
