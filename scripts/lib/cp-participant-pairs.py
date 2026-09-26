#!/usr/bin/env python3
"""Read an EDC Management API participant list on stdin, print "<ctx> <did>".

Used by scripts/seed-identityhub-participants.sh so the IdentityHub records it
creates carry the same context ids and DIDs the control plane already uses.
Anything unexpected on stdin prints nothing, so the caller falls back rather
than seeding garbage (#345).
"""
import json
import sys

try:
    rows = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if not isinstance(rows, list):
    sys.exit(0)

for row in rows:
    if not isinstance(row, dict):
        continue
    ctx = row.get("@id") or row.get("participantContextId") or ""
    did = row.get("identity") or row.get("did") or ""
    # A DID is the thing IdentityHub keys on; without one the row is unusable.
    if ctx and did.startswith("did:"):
        print(f"{ctx} {did}")
