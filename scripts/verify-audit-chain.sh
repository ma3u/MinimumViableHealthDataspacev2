#!/usr/bin/env bash
# Verify the tamper-evident query audit chain in Neo4j (ADR-045 plane 2, #418).
#
#   scripts/verify-audit-chain.sh [chain]        # default chain: query
#
# Reads every AuditEvent of the chain in order and recomputes each hash and
# link to its predecessor. Exit 0 intact, 1 broken (prints the first bad seq),
# 2 could not read. Connection from NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
# (local defaults: bolt://localhost:7687, neo4j, healthdataspace).
set -euo pipefail
cd "$(dirname "$0")/../services/neo4j-proxy"
exec npx --no-install tsx src/cli/verify-audit-chain.ts "$@"
