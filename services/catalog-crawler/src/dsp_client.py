"""DSP 2025-1 catalog client.

Minimum surface: POST `{dspCatalogUrl}/catalog/request` with an empty
QuerySpec and return the parsed JSON-LD body. The full DSP spec allows
filters, pagination, and a signed ContractRequestMessage envelope — we
don't need any of that for bulk enrichment, so the client stays thin
and doesn't pull the Java EDC SDK.

DID signing is out of scope for the MVP (ADR-020 open question 3). We
attach the crawler DID as a custom header so publishers that audit
access see us, but no detached JWS yet.
"""

from __future__ import annotations

import httpx

# The QuerySpec shape DSP 2025-1 expects — empty means "return everything
# you're willing to share." Filter support is deferred.
EMPTY_QUERY_SPEC: dict = {
    "@context": {"edc": "https://w3id.org/edc/v0.0.1/ns/"},
    "@type": "edc:QuerySpec",
    "offset": 0,
    "limit": 1000,
}


def _catalog_endpoint(base_url: str) -> str:
    """Normalise to `{base}/catalog/request` regardless of trailing slash."""
    return base_url.rstrip("/") + "/catalog/request"


async def fetch_catalog(
    client: httpx.AsyncClient,
    dsp_catalog_url: str,
    crawler_did: str,
    timeout_s: float,
) -> dict:
    """Return the dcat:Catalog JSON-LD document.

    Raises httpx.HTTPError / ValueError; the caller decides how to
    record the failure in metrics.
    """
    resp = await client.post(
        _catalog_endpoint(dsp_catalog_url),
        json=EMPTY_QUERY_SPEC,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Crawler-Did": crawler_did,
        },
        timeout=timeout_s,
    )
    resp.raise_for_status()
    body = resp.json()
    if not isinstance(body, dict):
        raise ValueError(
            f"DSP catalog at {dsp_catalog_url} returned {type(body).__name__}, expected dict"
        )
    return body
