# =============================================================================
# spe-loader: hub graph to sealed extract, Trustee key release, SPE workspace
# (ADR-068, ADR-069, #774)
# =============================================================================
# Build context is the repository root, for neo4j/*.cypher (the schema and the
# HealthDCAT-AP registrations a workspace gets):
#   docker build -f services/spe-loader/Dockerfile -t mvhd/spe-loader:local .
#
# kbs-client comes from KBS_CLIENT_IMAGE:
#   - default: Trustee v0.22.0's published kbs-client (commit 512fed65), sample
#     attester only, static, amd64 and arm64: the compose overlay (M1);
#   - on Azure: the image kbs-client.aci.Dockerfile builds, with the SEV-SNP
#     attester for ACI confidential containers (ADR-069). TSS_RUNTIME=true
#     only for a kbs-client built with the vTPM attester instead.
# =============================================================================
ARG KBS_CLIENT_IMAGE=ghcr.io/confidential-containers/staged-images/kbs-client-image:512fed65642015b849f38fb13bfdec7806639987@sha256:d1e65dfc86687553ea58bf308d06cbcf17936c4b4c71e9ab8352cda31d75b638

FROM ${KBS_CLIENT_IMAGE} AS kbs

# node:22-bookworm-slim
FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS build
WORKDIR /app
COPY services/spe-loader/package.json services/spe-loader/package-lock.json ./
RUN npm ci --ignore-scripts
COPY services/spe-loader/tsconfig.json services/spe-loader/tsconfig.build.json ./
COPY services/spe-loader/src ./src
RUN npm run build

FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
ARG TSS_RUNTIME=false
# openssl and bash for trustee-setup.sh (the access body's keys); libtss2 only
# for a vTPM attester (an Azure confidential VM), not needed on ACI.
# Runtime packages from the pinned base image's Debian release; pinning their patch
# versions breaks the build at every security update of the base.
# hadolint ignore=DL3008
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates openssl && \
    if [ "$TSS_RUNTIME" = "true" ]; then \
      apt-get install -y --no-install-recommends libtss2-esys-3.0.2-0 libtss2-tctildr0 libtss2-tcti-device0 libtss2-mu0 libtss2-sys1; \
    fi && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY services/spe-loader/package.json services/spe-loader/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=kbs /usr/local/bin/kbs-client /usr/local/bin/kbs-client
COPY services/spe-loader/scripts ./scripts
# The access body's policies and reference values, for trustee-configure in the
# Azure admin job (mvhd-trustee-admin); compose mounts ./trustee instead.
COPY trustee/policies ./trustee/policies
COPY trustee/reference-values-local.json trustee/workload-local.json ./trustee/
COPY neo4j/init-schema.cypher neo4j/register-fhir-dataset-hdcatap-spe1.cypher neo4j/register-fhir-dataset-hdcatap-spe2.cypher ./neo4j/
RUN ln -s /app/dist/cli.js /usr/local/bin/spe-loader && chmod 0755 /app/dist/cli.js
# The image's `node` user. The access body's tools (trustee-setup, extract)
# run as root in compose because they write Trustee's key volume.
USER 1000
ENTRYPOINT ["spe-loader"]
