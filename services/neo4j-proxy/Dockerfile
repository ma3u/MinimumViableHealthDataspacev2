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
# The image's `node` user, by id (hadolint DL3066).
USER 1000:1000
# tracing.js first: OTel must hook the loader before express is imported.
# It does nothing unless OTEL_EXPORTER_OTLP_ENDPOINT is set (ADR-045, #418).
CMD ["node", "--import", "./dist/tracing.js", "dist/index.js"]
