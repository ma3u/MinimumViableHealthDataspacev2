#!/usr/bin/env python3
"""Pushes the App Store listing: categories, texts, and screenshots.

Run it after `Scripts/capture-screenshots.sh`. Everything is idempotent, so a
second run replaces rather than appends, and a text that is already correct is
simply written again.

  export ASC_APP_ID=6811688174
  python3 appstore/push.py [--texts-only | --screenshots-only]

Two traps this script exists to avoid:

  * `whatsNew` cannot be written on a first version. App Store Connect rejects
    the whole PATCH for it rather than ignoring the field, so every other text
    silently fails to land too.
  * A screenshot of the wrong size is accepted, uploaded, and only then marked
    FAILED during processing. It stays visible in the set and is dropped at
    submission. So sizes are checked before sending, and the processing verdict
    is waited for afterwards.
"""
import hashlib, os, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texts
from client import call

# APP_IPHONE_67 is the iPhone slot App Store Connect wants, but it accepts only
# the two newest sizes. 1284x2778, which Apple's own size table still lists,
# fails processing with IMAGE_INCORRECT_DIMENSIONS.
DISPLAY_TYPE = "APP_IPHONE_67"
ACCEPTED_SIZES = {(1320, 2868), (1290, 2796)}

# The order a visitor swipes through, so the five tell a story: here are your
# reports, here is one value by value, here is what leaves the phone, here is
# where an answer comes from, here is the whole policy.
SCREENSHOT_ORDER = ["list", "detail", "consent", "settings", "privacy"]

PRIMARY_CATEGORY = "MEDICAL"
SECONDARY_CATEGORY = "HEALTH_AND_FITNESS"


def app_id():
    value = os.environ.get("ASC_APP_ID")
    if not value:
        raise SystemExit("ASC_APP_ID is not set (App Store Connect → App Information)")
    return value


def current_version(app):
    versions = call("GET", f"/v1/apps/{app}/appStoreVersions?limit=10")["data"]
    editable = [v for v in versions
                if v["attributes"]["appStoreState"] in
                ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED")]
    if not editable:
        raise SystemExit("no editable App Store version; create one in App Store Connect")
    return editable[0]["id"]


def push_app_info(app):
    info = call("GET", f"/v1/apps/{app}/appInfos")["data"][0]["id"]
    call("PATCH", f"/v1/appInfos/{info}", {"data": {
        "type": "appInfos", "id": info, "relationships": {
            "primaryCategory": {"data": {"type": "appCategories", "id": PRIMARY_CATEGORY}},
            "secondaryCategory": {"data": {"type": "appCategories", "id": SECONDARY_CATEGORY}},
        }}})
    print(f"categories: {PRIMARY_CATEGORY} / {SECONDARY_CATEGORY}")

    existing = {d["attributes"]["locale"]: d["id"]
                for d in call("GET", f"/v1/appInfos/{info}/appInfoLocalizations")["data"]}
    for locale in texts.APP_NAME:
        attributes = {"name": texts.APP_NAME[locale],
                      "subtitle": texts.SUBTITLE[locale],
                      "privacyPolicyUrl": texts.PRIVACY_URL}
        if locale in existing:
            call("PATCH", f"/v1/appInfoLocalizations/{existing[locale]}", {"data": {
                "type": "appInfoLocalizations", "id": existing[locale],
                "attributes": attributes}})
            print(f"  {locale}: updated")
        else:
            attributes["locale"] = locale
            call("POST", "/v1/appInfoLocalizations", {"data": {
                "type": "appInfoLocalizations", "attributes": attributes,
                "relationships": {"appInfo": {"data": {"type": "appInfos", "id": info}}}}})
            print(f"  {locale}: created")


def push_version_texts(version):
    existing = {d["attributes"]["locale"]: d["id"] for d in call(
        "GET", f"/v1/appStoreVersions/{version}/appStoreVersionLocalizations")["data"]}
    for locale in texts.DESCRIPTION:
        if locale not in existing:
            print(f"  {locale}: no localization on this version, skipped")
            continue
        for field, limit in texts.LIMITS.items():
            if field == "whatsNew":
                continue
            source = getattr(texts, texts.FIELD_SOURCE[field])
            if locale in source and len(source[locale]) > limit:
                raise SystemExit(
                    f"{locale} {field} is {len(source[locale])} chars, limit is {limit}")
        # whatsNew is deliberately absent: see the module docstring.
        call("PATCH", f"/v1/appStoreVersionLocalizations/{existing[locale]}", {"data": {
            "type": "appStoreVersionLocalizations", "id": existing[locale],
            "attributes": {
                "description": texts.DESCRIPTION[locale],
                "keywords": texts.KEYWORDS[locale],
                "promotionalText": texts.PROMO[locale],
                "supportUrl": texts.SUPPORT_URL,
                "marketingUrl": texts.MARKETING_URL,
            }}})
        print(f"  {locale}: description, keywords, promotional text, URLs")


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(26)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path} is not a PNG")
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def upload_one(set_id, path):
    with open(path, "rb") as f:
        data = f.read()
    name = os.path.basename(path)
    created = call("POST", "/v1/appScreenshots", {"data": {
        "type": "appScreenshots",
        "attributes": {"fileSize": len(data), "fileName": name},
        "relationships": {"appScreenshotSet": {
            "data": {"type": "appScreenshotSets", "id": set_id}}}}})
    screenshot = created["data"]["id"]

    for op in created["data"]["attributes"]["uploadOperations"]:
        chunk = data[op["offset"]:op["offset"] + op["length"]]
        request = urllib.request.Request(op["url"], method=op["method"], data=chunk)
        for header in op["requestHeaders"]:
            request.add_header(header["name"], header["value"])
        with urllib.request.urlopen(request, timeout=180) as response:
            if response.status not in (200, 201, 204):
                raise SystemExit(f"{name}: upload returned {response.status}")

    call("PATCH", f"/v1/appScreenshots/{screenshot}", {"data": {
        "type": "appScreenshots", "id": screenshot,
        "attributes": {"uploaded": True,
                       "sourceFileChecksum": hashlib.md5(data).hexdigest()}}})
    print(f"  sent {name} ({len(data)} bytes)")


def push_screenshots(version, folder):
    localizations = call(
        "GET", f"/v1/appStoreVersions/{version}/appStoreVersionLocalizations")["data"]
    for localization in localizations:
        locale = localization["attributes"]["locale"]
        print(f"screenshots for {locale}:")
        sets = call("GET", f"/v1/appStoreVersionLocalizations/{localization['id']}"
                           "/appScreenshotSets")["data"]
        existing = {d["attributes"]["screenshotDisplayType"]: d["id"] for d in sets}

        if DISPLAY_TYPE in existing:
            set_id = existing[DISPLAY_TYPE]
            # Replacing, not appending: a second run must not leave the old
            # five in front of the new five.
            for old in call("GET", f"/v1/appScreenshotSets/{set_id}/appScreenshots"
                                   "?limit=50")["data"]:
                call("DELETE", f"/v1/appScreenshots/{old['id']}")
                print(f"  removed {old['attributes']['fileName']}")
        else:
            set_id = call("POST", "/v1/appScreenshotSets", {"data": {
                "type": "appScreenshotSets",
                "attributes": {"screenshotDisplayType": DISPLAY_TYPE},
                "relationships": {"appStoreVersionLocalization": {
                    "data": {"type": "appStoreVersionLocalizations",
                             "id": localization["id"]}}}}})["data"]["id"]
            print(f"  created {DISPLAY_TYPE} set")

        for name in SCREENSHOT_ORDER:
            path = os.path.join(folder, f"{name}.png")
            size = png_size(path)
            if size not in ACCEPTED_SIZES:
                raise SystemExit(
                    f"{path} is {size[0]}x{size[1]}; {DISPLAY_TYPE} accepts "
                    + " or ".join(f"{w}x{h}" for w, h in sorted(ACCEPTED_SIZES)))
            upload_one(set_id, path)

        # Apple processes after the commit, so the state here is
        # UPLOAD_COMPLETE. Wait for the verdict: a screenshot that fails
        # processing stays in the set looking fine and is dropped at submission.
        for _ in range(45):
            rows = call("GET", f"/v1/appScreenshotSets/{set_id}/appScreenshots"
                               "?limit=50")["data"]
            states = {r["attributes"]["fileName"]: r["attributes"]["assetDeliveryState"]
                      for r in rows}
            if not any(s["state"] == "UPLOAD_COMPLETE" for s in states.values()):
                break
            time.sleep(4)

        failed = {n: s for n, s in states.items() if s["state"] != "COMPLETE"}
        for name, state in states.items():
            print(f"  {name}: {state['state']}"
                  + (f" {state.get('errors')}" if name in failed else ""))
        if failed:
            raise SystemExit(f"{len(failed)} screenshot(s) did not process: {list(failed)}")
        print(f"  all {len(states)} COMPLETE")


def main(argv):
    only = argv[1] if len(argv) > 1 else None
    app = app_id()
    version = current_version(app)
    folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")

    if only != "--screenshots-only":
        push_app_info(app)
        print("version texts:")
        push_version_texts(version)
    if only != "--texts-only":
        push_screenshots(version, folder)


if __name__ == "__main__":
    main(sys.argv)
