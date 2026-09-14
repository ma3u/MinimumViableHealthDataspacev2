#!/bin/bash
# Fails when a user-visible string has no German, or when a German sentence has
# been left in the English base.
#
# Both have happened. The camera permission prompt, the first thing a person
# sees, was written in German and shipped that way to every English phone,
# because nothing checked. `xcodebuild -exportLocalizations` is the same
# extractor Xcode's own editor uses, so it sees SwiftUI `Text` literals and
# `INFOPLIST_KEY_*` values that no grep of the sources would find.
set -euo pipefail

cd "$(dirname "$0")/.."
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

xcodebuild -project MeinBefund.xcodeproj -exportLocalizations \
  -localizationPath "$out" -exportLanguage de >"$out/log" 2>&1 ||
  { cat "$out/log"; echo "export failed"; exit 1; }

python3 - "$out" <<'PY'
import glob, re, sys, xml.etree.ElementTree as ET

ns = "{urn:oasis:names:tc:xliff:document:1.2}"

# Strings that are the same in both languages, or are not prose at all.
# Listed one by one rather than pattern-matched: a new untranslated sentence
# should fail the check, not slip through a clever regex.
same_in_both = {
    "Shared", "MeinBefund", "Klarbefund", "Anthropic", "Azure OpenAI", "OK", "·",
    "LOINC %@", "Ref. %@", "%@ · %@", "%@%@ %@", "%@  %@ %@",
    "%@ %@ · LOINC %@", "https://<name>.openai.azure.com",
}

missing, german_in_base, total = [], [], 0
# Words that do not occur in English, so their presence in a source string
# means the base language was written in German by mistake. Matched on word
# boundaries: "und" as a substring is inside "MeinBefund uses".
tells = re.compile(
    r"\b(und|oder|nicht|nur|werden|wird|Ihre|Ihren|Ihrem|Ihr|diesem|diese|keine"
    r"|nutzt|bleiben|verschluesselt|verschl\u00fcsselt|gesendet|Werte|Aufnahmen)\b"
)

for f in glob.glob(f"{sys.argv[1]}/de.xcloc/Localized Contents/**/*.xliff", recursive=True):
    for unit in ET.parse(f).getroot().iter(f"{ns}trans-unit"):
        src, tgt = unit.find(f"{ns}source"), unit.find(f"{ns}target")
        if src is None or not (src.text or ""):
            continue
        total += 1
        if tells.search(src.text):
            german_in_base.append(src.text)
        translated = tgt is not None and (tgt.text or "").strip() and tgt.text != src.text
        if not translated and src.text not in same_in_both:
            missing.append(src.text)

if total < 50:
    sys.exit(f"only {total} strings extracted: the export did not run properly")

for label, rows in (("no German translation", missing),
                    ("German left in the English base", german_in_base)):
    for row in rows:
        print(f"  {label}: {row[:90]}")

if missing or german_in_base:
    sys.exit(f"{len(missing) + len(german_in_base)} localisation problem(s) in {total} strings")
print(f"localisation ok: {total} strings, every prose string has German")
PY
