"""Unit tests for dsp_client — pure HTTP shape, no network."""

from __future__ import annotations

import httpx
import pytest
import respx

from src import dsp_client


@pytest.mark.asyncio
@respx.mock
async def test_fetch_catalog_returns_body_on_200() -> None:
    respx.post("https://dsp.example/catalog/request").respond(
        200,
        json={
            "@context": {"dcat": "http://www.w3.org/ns/dcat#"},
            "dcat:dataset": [
                {"@id": "dataset:x", "dct:title": "Example dataset"}
            ],
        },
    )
    async with httpx.AsyncClient() as client:
        body = await dsp_client.fetch_catalog(
            client, "https://dsp.example", "did:web:crawler", 5.0
        )
    assert isinstance(body, dict)
    assert body["dcat:dataset"][0]["@id"] == "dataset:x"


@pytest.mark.asyncio
@respx.mock
async def test_fetch_catalog_normalises_trailing_slash() -> None:
    respx.post("https://dsp.example/catalog/request").respond(200, json={"ok": True})
    async with httpx.AsyncClient() as client:
        # Trailing slash on the base URL should not produce
        # /catalog/request with a double-slash.
        body = await dsp_client.fetch_catalog(
            client, "https://dsp.example/", "did:web:crawler", 5.0
        )
    assert body == {"ok": True}


@pytest.mark.asyncio
@respx.mock
async def test_fetch_catalog_sends_crawler_did_header() -> None:
    route = respx.post("https://dsp.example/catalog/request").respond(
        200, json={"ok": True}
    )
    async with httpx.AsyncClient() as client:
        await dsp_client.fetch_catalog(
            client, "https://dsp.example", "did:web:ehds.mabu.red:crawler", 5.0
        )
    assert route.called
    sent_did = route.calls[0].request.headers.get("X-Crawler-Did")
    assert sent_did == "did:web:ehds.mabu.red:crawler"


@pytest.mark.asyncio
@respx.mock
async def test_fetch_catalog_raises_on_5xx() -> None:
    respx.post("https://dsp.example/catalog/request").respond(503)
    async with httpx.AsyncClient() as client:
        with pytest.raises(httpx.HTTPStatusError):
            await dsp_client.fetch_catalog(
                client, "https://dsp.example", "did:web:crawler", 5.0
            )


@pytest.mark.asyncio
@respx.mock
async def test_fetch_catalog_raises_on_non_object_body() -> None:
    # Spec violation — DSP catalog MUST be a dcat:Catalog object, not a list.
    respx.post("https://dsp.example/catalog/request").respond(200, json=["not a catalog"])
    async with httpx.AsyncClient() as client:
        with pytest.raises(ValueError):
            await dsp_client.fetch_catalog(
                client, "https://dsp.example", "did:web:crawler", 5.0
            )
