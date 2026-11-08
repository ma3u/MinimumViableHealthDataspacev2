"""The secrets Simpl's issuer service reads, served the way Vault's KV v2 API serves them. #934 step 0a.

Simpl's `issuer-service-be` (v1.6.0) only ever GETs three maps from Vault, each keyed by
actor (the `clientId` of an issue request): `certificates` (a base64 PKCS#12), `passwords`
and `dids`, at /v1/kv/data/vc-issuer-service/<map> with an X-Vault-Token header
(VaultPlugin.java, VaultClient.java). Simpl tests the service against a mock that does
exactly this (src/test/resources/vault-mock/mini-vault.ps1); this is that mock for compose.

The maps are JSON files in /data, written by scripts/seed-simpl-issuer.sh. Standard
library only, so it runs on a plain Python image.
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DATA = Path(os.environ.get("SIMPL_VAULT_DATA", "/data"))
TOKEN = os.environ.get("SIMPL_VAULT_TOKEN", "")
PREFIX = "/v1/kv/data/vc-issuer-service/"
# The only files served, looked up by name: a request never becomes a path.
FILES = {name: DATA / f"{name}.json" for name in ("certificates", "passwords", "dids")}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802 (http.server's name)
        if self.path == "/v1/sys/health":
            ready = all(f.is_file() for f in FILES.values())
            self._send(200 if ready else 503, {"initialized": ready, "sealed": not ready})
            return
        if not TOKEN or self.headers.get("X-Vault-Token") != TOKEN:
            self._send(403, {"errors": ["permission denied"]})
            return
        source = FILES.get(self.path[len(PREFIX):]) if self.path.startswith(PREFIX) else None
        if source is None or not source.is_file():
            self._send(404, {"errors": []})
            return
        self._send(200, {"data": {"data": json.loads(source.read_text())}})

    def log_message(self, fmt: str, *args) -> None:
        # One line per request without the token, which never reaches the log.
        print(f"{self.command} {self.path.split('?')[0]} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8200), Handler).serve_forever()
