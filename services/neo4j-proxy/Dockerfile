# =============================================================================
# Neo4j Query Proxy — multi-stage Docker build
# =============================================================================
# Bridges DCore data planes ↔ Neo4j graph database (ADR-2).
# Translates HTTP requests into Cypher queries, serialises results as
# FHIR Bundle JSON, OMOP CSV/JSON, or HealthDCAT-AP JSON-LD.
# =============================================================================

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist

EXPOSE 9090
# Container Apps takes its probes from the app definition, not the image; this
# check is for compose and for anyone who runs the image by hand (security
# test report 2026-10-15, F6).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/bin/sh", "-c", "wget -q --spider http://127.0.0.1:${PORT:-9090}/health || exit 1"]
# The image's `node` user, by id (hadolint DL3066).
USER 1000:1000
# tracing.js first: OTel must hook the loader before express is imported.
# It does nothing unless OTEL_EXPORTER_OTLP_ENDPOINT is set (ADR-045, #418).
CMD ["node", "--import", "./dist/tracing.js", "dist/index.js"]
