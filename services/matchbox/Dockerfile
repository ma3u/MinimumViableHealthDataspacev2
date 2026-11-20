# =============================================================================
# Matchbox with the IG packages baked in (ADR-095, #1174)
# =============================================================================
# The validator behind the neo4j-proxy's POST /fhir/$validate: Matchbox
# (ahdis, the HL7 Java validator as a FHIR server), configured by
# application.yaml, which scripts/eehrxf/build.py writes from
# scripts/eehrxf/profiles.json (FHIR R4 core and the HL7 Europe IGs the CI
# validator uses, #1144; no terminology server; read-only).
#
# bake.sh starts Matchbox once during the build, so it fetches every package
# and its dependencies from the FHIR package servers into its H2 database
# under /database, and stops it. A container from this image starts from that
# database and fetches nothing: no network to packages.fhir.org at start, and
# about a minute instead of four and a half (measured, ADR-095). A new IG or
# version in profiles.json is a new image; build.py --check keeps
# application.yaml current.
#
# Built by .github/workflows/deploy-azure.yml (tagged with this directory's
# git tree hash, so only a change here rebuilds) and by
# docker-compose.matchbox.yml locally. The build needs network and about
# 3 GB of memory; the image is the base plus the database.
#
# Base pinned by tag and digest (ADR-029); multi-arch (amd64, arm64).
# =============================================================================
FROM europe-west6-docker.pkg.dev/ahdis-ch/ahdis/matchbox:v4.1.21@sha256:d73b558b87ead55a63c35174b53bca655d48f77abdd22db3ca5f68032533f51a

# The base image's entrypoint reads /config/application.yaml and keeps its H2
# database in /database (relative to /); both belong to its matchbox user (1000).
WORKDIR /
COPY --chown=1000:1000 application.yaml /config/application.yaml
COPY --chmod=0755 bake.sh /usr/local/bin/matchbox-bake
# The base image's matchbox user, by id (hadolint DL3066).
USER 1000:1000
RUN /usr/local/bin/matchbox-bake

EXPOSE 8080
# The base image's HEALTHCHECK (curl on /matchboxv3/actuator/health) stays;
# Container Apps takes its probes from the app definition
# (scripts/azure/22-matchbox.sh).
