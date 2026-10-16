FROM node:22-alpine AS base

# Install dependencies only when package.json changes
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG BUILD_SHA=""
ARG BUILD_TIME=""
ARG BUILD_CHANNEL="local"
ENV DOCKER_BUILD=1 \
    BUILD_SHA=$BUILD_SHA \
    BUILD_TIME=$BUILD_TIME \
    BUILD_CHANNEL=$BUILD_CHANNEL
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER 1001:1001
EXPOSE 3000
# Container Apps takes its probes from the app definition, not the image; this
# check is for compose and for anyone who runs the image by hand (security
# test report 2026-10-15, F6).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/bin/sh", "-c", "wget -q --spider http://127.0.0.1:${PORT:-3000}/api/health || exit 1"]
ENV PORT=3000
CMD ["node", "server.js"]
