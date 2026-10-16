# Unseal sidecar for mvhd-vault (ADR-046). Built by 14-vault-on-postgres.sh
# with the repository root as context, tagged with the commit, never :latest
# (ACA caches :latest, CLAUDE.md gotcha 6).
ARG VAULT_VERSION=2.0
FROM hashicorp/vault:${VAULT_VERSION}
# The image runs as 'vault'. Root here for apk, and at run time to write the
# key file on the SMB share, as the compose sidecar does (user "0").
# hadolint ignore=DL3002
USER 0
# Fuzzy pin to the 17 series, which hadolint 2.14 does not recognise: Alpine
# main keeps only the latest patch, so an exact pin stops resolving on the
# next release (as compliance-runner/Dockerfile does it).
# hadolint ignore=DL3018
RUN apk add --no-cache postgresql17-client~17
COPY scripts/vault-init-or-unseal.sh /app/vault-init-or-unseal.sh
COPY scripts/azure/vault-unseal/unseal-loop.sh /app/unseal-loop.sh
COPY scripts/azure/vault-unseal/vault-pg-schema.sql /app/vault-pg-schema.sql
# Root was needed for apk only; the loop runs psql and the vault CLI and writes
# nothing but /tmp, so it drops to the image's vault user, uid 100 as the
# official image creates it (trivy DS-0002; hadolint DL3066 wants the number).
USER 100
# The sidecar is healthy when the Vault it tends answers unsealed: `vault
# status` exits 0 unsealed, 2 sealed, 1 unreachable (security test report
# 2026-10-15, F6).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["/bin/sh", "-c", "VAULT_ADDR=${VAULT_ADDR:-http://127.0.0.1:8200} vault status >/dev/null 2>&1"]
ENTRYPOINT ["/bin/sh", "/app/unseal-loop.sh"]
