#!/usr/bin/env python3
"""Check the EHDS terminology against the Official Journal text (#782).

ui/src/lib/i18n/ehds-terminology.json lists the terms every translation on the
hub must use, in English, German, French, Dutch and Spanish. This reads the
text of Regulation (EU) 2025/327 in each language from the Publications Office
(Cellar; EUR-Lex itself refuses scripts) and fails when a term does not occur
in its language version. A term marked "avoid" is reported where the text
uses it too: the German version says "Dateninhaber" twice in passing, but
defines and otherwise uses "Gesundheitsdateninhaber", and so does the hub.

    python3 scripts/i18n/check-ehds-terminology.py
    python3 scripts/i18n/check-ehds-terminology.py --cache /tmp/eurlex

Needs the network, so it is not part of CI; run it when the file changes.
Exit 0 when every term is found, 1 otherwise.
"""
import argparse
import html
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TERMS = os.path.join(HERE, "..", "..", "ui", "src", "lib", "i18n", "ehds-terminology.json")
CELLAR = "http://publications.europa.eu/resource/celex/32025R0327"
LANG3 = {"en": "eng", "de": "deu", "fr": "fra", "nl": "nld", "es": "spa"}


def text(lang, cache):
    path = os.path.join(cache, f"{LANG3[lang]}.html") if cache else None
    if path and os.path.exists(path):
        raw = open(path, encoding="utf-8").read()
    else:
        req = urllib.request.Request(
            CELLAR,
            headers={"Accept": "application/xhtml+xml", "Accept-Language": LANG3[lang]},
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode("utf-8")
        if path:
            os.makedirs(cache, exist_ok=True)
            open(path, "w", encoding="utf-8").write(raw)
    plain = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    return re.sub(r"\s+", " ", plain).lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", help="keep the downloaded texts in this folder")
    args = ap.parse_args()
    terms = json.load(open(TERMS, encoding="utf-8"))["terms"]
    texts = {lang: text(lang, args.cache) for lang in LANG3}
    failures = 0
    for t in terms:
        for lang in LANG3:
            n = texts[lang].count(t[lang].lower())
            mark = "ok " if n else "MISSING"
            failures += 0 if n else 1
            print(f"{mark} {t['id']:32} {lang} {n:4}  {t[lang]}")
        for lang, words in t.get("avoid", {}).items():
            for w in words:
                # As a word of its own: "Dateninhaber" inside
                # "Gesundheitsdateninhaber" is the official term.
                n = len(re.findall(r"(?<![a-zäöüßéèàç])" + re.escape(w.lower()), texts[lang]))
                print(f"{'avoid' if n == 0 else 'USED '} {t['id']:32} {lang} {n:4}  {w}")
    print(f"\n{failures} term(s) not found in their language version")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
