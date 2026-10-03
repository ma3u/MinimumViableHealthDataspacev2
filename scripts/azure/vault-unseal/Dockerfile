# Unseal sidecar for mvhd-vault (ADR-046). Built by 14-vault-on-postgres.sh
# with the repository root as context, tagged with the commit, never :latest
# (ACA caches :latest, CLAUDE.md gotcha 6).
ARG VAULT_VERSION=2.0
FROM hashicorp/vault:${VAULT_VERSION}
# The image runs as 'vault'. Root here for apk, and at run time to write the
# key file on the SMB share, as the compose sidecar does (user "0").
# hadolint ignore=DL3002
USER root
RUN apk add --no-cache postgresql17-client=17.10-r0
COPY scripts/vault-init-or-unseal.sh /app/vault-init-or-unseal.sh
COPY scripts/azure/vault-unseal/unseal-loop.sh /app/unseal-loop.sh
COPY scripts/azure/vault-unseal/vault-pg-schema.sql /app/vault-pg-schema.sql
ENTRYPOINT ["/bin/sh", "/app/unseal-loop.sh"]
