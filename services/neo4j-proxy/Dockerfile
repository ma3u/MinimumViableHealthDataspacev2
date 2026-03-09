# =============================================================================
# Neo4j Query Proxy — multi-stage Docker build
# =============================================================================
# Bridges DCore data planes ↔ Neo4j graph database (ADR-2).
# Translates HTTP requests into Cypher queries, serialises results as
# FHIR Bundle JSON, OMOP CSV/JSON, or HealthDCAT-AP JSON-LD.
# =============================================================================

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist

EXPOSE 9090
USER node
CMD ["node", "dist/index.js"]
