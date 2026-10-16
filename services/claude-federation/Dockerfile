# syntax=docker/dockerfile:1
FROM node:22.14-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.14-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Never root: this process holds the only credential path in the system.
USER 1000:1000
EXPOSE 8080
# Container Apps takes its probes from the app definition, not the image; this
# check is for compose and for anyone who runs the image by hand (security
# test report 2026-10-15, F6).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/bin/sh", "-c", "wget -q --spider http://127.0.0.1:${PORT:-8080}/health || exit 1"]
CMD ["node", "dist/server.js"]
