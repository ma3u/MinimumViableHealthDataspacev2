FROM node:20-alpine AS base

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

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
