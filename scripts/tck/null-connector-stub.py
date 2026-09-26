#!/usr/bin/env python3
"""A fake Management API that knows nothing about DSP, for falsifying our suites.

Discussion #110 argues that a self-authored conformance suite tests our reading
of the spec rather than the spec. This stub is how that argument is checked
rather than asserted.

It answers participant discovery with three hardcoded contexts and replies to
every other request with an empty JSON array. It implements no protocol, holds
no assets, negotiates nothing, and transfers nothing. Any check it passes is a
check that is not measuring conformance.

Measured 2026-09-26. Point ALL of EDC_MANAGEMENT_URL, EDC_IDENTITY_URL and
EDC_ISSUER_URL at the stub; setting only the first leaves the DCP suite talking
to a real IdentityHub and IssuerService, which is how the first published DCP
figure for this stub came out wrong.

    DSP   this stub          23 passed,  1 failed,  9 skipped / 33
          real Azure stack   23 passed,  0 failed, 10 skipped / 33

    DCP   this stub          14 passed,  0 failed,  8 skipped / 22
          real local stack   14 passed,  0 failed,  8 skipped / 22
          real Azure stack   10 passed,  1 failed, 11 skipped / 22

Neither suite can tell the stub from a real connector; the DCP suite scores it
identically to the local stack and better than Azure. That is the finding, and
it is the reason Phase 1 of #338 adopts the Eclipse TCK.

The DCP numbers move once the no-fail checks are fixed: the stub drops to
11 passed / 8 failed. SCOPE-5.1 to 5.3 read the control plane's container
environment rather than the API, so they still pass against a local stack no
matter what the stub answers, and they skip where Docker is not visible.

ADR-031 requires that a guard be exercised at least once against the failing
condition. For the protocol suites, this is that exercise: run it after
changing an assertion and confirm the stub's pass count goes DOWN.

Usage:
    python3 scripts/tck/null-connector-stub.py &
    EDC_MANAGEMENT_URL=http://localhost:18099 ./scripts/run-dsp-tck.sh
    kill %1
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 18099

# Shaped to satisfy discovery only: mgmt_fetch_participants reads .identity
# and ["@id"]. Fictional orgs per the repo's demo-data policy.
PARTICIPANTS = [
    {"@id": "ctx-alpha", "identity": "did:web:alpha-klinik.de:participant", "state": "ACTIVATED"},
    {"@id": "ctx-pharmaco", "identity": "did:web:pharmaco.de:research", "state": "ACTIVATED"},
    {"@id": "ctx-medreg", "identity": "did:web:medreg.de:hdab", "state": "ACTIVATED"},
]


class NullConnector(BaseHTTPRequestHandler):
    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.endswith("/participants"):
            return self._send(PARTICIPANTS)
        return self._send([])

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        # Not a catalog, not an acknowledgement, not anything. Just valid JSON.
        return self._send([])

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"null connector stub on http://127.0.0.1:{PORT}", file=sys.stderr)
    HTTPServer(("127.0.0.1", PORT), NullConnector).serve_forever()
