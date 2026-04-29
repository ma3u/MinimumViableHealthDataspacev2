"""
Re-load the AWMF register and capture FULL request headers for the
leitlinien-api.awmf.org call, so we can identify the auth token / API key
that the SPA injects.
"""
import asyncio
import json
import sys
from playwright.async_api import async_playwright

REGISTER_URL = "https://register.awmf.org/de/leitlinien/aktuelle-leitlinien"


async def main():
    captured = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/130.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        async def on_request(req):
            if "leitlinien-api.awmf.org" in req.url:
                try:
                    headers = await req.all_headers()
                except Exception:
                    headers = req.headers
                captured.append({
                    "url": req.url,
                    "method": req.method,
                    "headers": headers,
                })

        page.on("request", on_request)

        print(f"Loading {REGISTER_URL} ...", file=sys.stderr)
        await page.goto(REGISTER_URL, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)

        # Also dump cookies in case auth is cookie-based
        cookies = await context.cookies()

        await browser.close()

    print(f"\nCaptured {len(captured)} leitlinien-api requests\n")
    for c in captured:
        print(f"=== {c['method']} {c['url']} ===")
        for k, v in sorted(c["headers"].items()):
            print(f"  {k}: {v[:200]}")
        print()

    print(f"=== Cookies ({len(cookies)}) ===")
    for c in cookies:
        print(f"  {c['domain']}{c['path']}  {c['name']}={c['value'][:80]}")


if __name__ == "__main__":
    asyncio.run(main())
