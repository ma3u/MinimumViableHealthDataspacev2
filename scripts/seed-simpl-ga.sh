#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# The fictional Simpl Governance Authority, and the participant it admits. #710
# ---------------------------------------------------------------------------
# ADR-064 decision 2: a Simpl data space's Governance Authority is a trusted
# issuer in the hub, for the credentials it issues to that data space's
# participants. The control plane trusts it for MembershipCredential only
# (ui/src/content/trusted-issuers.json, docker-compose.jad.yml).
#
# This gives the authority its identity (scripts/seed-test-issuer.sh) and has
# Institut de Recherche Santé (irs) request its MembershipCredential from it
# over DCP. CI requests the hub issuer's membership for every participant but
# irs, so a request irs makes is carried by the authority's credential alone;
# scripts/run-ehds-identity-checks.sh (TRUST-6.x) asserts that and the refusal
# of an issuer on no list.
#
# Membership credentials are valid for seven days, so a stack older than that
# needs this run again, like scripts/request-participant-credentials.sh.
# ---------------------------------------------------------------------------
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GA_DID="did:web:simpl-ga-issuer%3A10016:simpl-ga"
HOLDER="${HOLDER:-irs}"

SERVICE=simpl-ga-issuer CTX=simpl-ga DB=simplga ADMIN_PORT=10023 \
HOLDERS="did:web:identityhub%3A7083:${HOLDER}" \
  "${SCRIPT_DIR}/seed-test-issuer.sh"

ISSUER_DID="$GA_DID" \
EDC_ISSUER_URL=http://localhost:10023/api/admin \
ISSUER_CTX=simpl-ga \
ONLY="$HOLDER" \
  "${SCRIPT_DIR}/request-participant-credentials.sh"
