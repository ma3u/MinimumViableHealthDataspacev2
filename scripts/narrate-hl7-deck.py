#!/usr/bin/env python3
"""Narrate the HL7 showcase deck in the presenter's own voice, one file per slide.

Reads the speaker notes of every top-level slide in the deck, sends each to
ElevenLabs, and writes ui/public/presentations/hl7-showcase-2026/audio/slide-N.mp3.
The deck's "Narration" button plays them as the slides come up.

The key comes from ELEVENLABS_API_KEY in the environment, or from the
repository's git-ignored .env, and is never written anywhere. The voice is
ELEVENLABS_VOICE_ID, or else the account's voice named ELEVENLABS_VOICE_NAME
("Matthi German" by default), looked up through the API.

Run from the repository root:

    python3 scripts/narrate-hl7-deck.py            # every slide
    python3 scripts/narrate-hl7-deck.py 3 7        # only slides 3 and 7
"""
import json, os, pathlib, re, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DECK = ROOT / "ui/public/presentations/hl7-showcase-2026/index.html"
OUT = ROOT / "ui/public/presentations/hl7-showcase-2026/audio"
MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")

def load_dotenv(path: pathlib.Path) -> None:
    """Loads KEY=VALUE lines into the environment without printing anything.

    The repository's .env is git-ignored and holds the ElevenLabs key; values
    already in the environment win, so a shell export still overrides it.
    """
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip().removeprefix("export ").strip()
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)


for candidate in (ROOT / ".env", ROOT / "docs/.env", ROOT / "ui/.env"):
    load_dotenv(candidate)
key = os.environ.get("ELEVENLABS_API_KEY")
if not key:
    sys.exit("no ELEVENLABS_API_KEY in the environment or in .env")
HEADERS = {"xi-api-key": key, "Content-Type": "application/json"}

voice = os.environ.get("ELEVENLABS_VOICE_ID")
if not voice:
    # Resolve the voice by its name in the account, "Matthias" unless told otherwise.
    wanted = os.environ.get("ELEVENLABS_VOICE_NAME", "Matthi German").lower()
    req = urllib.request.Request("https://api.elevenlabs.io/v1/voices", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        voices = json.load(r)["voices"]
    match = [v for v in voices if v["name"].strip().lower() == wanted] or \
            [v for v in voices if wanted in v["name"].lower()]
    if not match:
        sys.exit(f"no voice named {wanted!r}; the account has: " + ", ".join(v["name"] for v in voices))
    voice = match[0]["voice_id"]
    print(f"voice: {match[0]['name']} ({match[0].get('category', '')})")

html = DECK.read_text()
slides = re.search(r'<div class="slides">(.*)</div>\s*</div>\s*<div class="narration"', html, re.S).group(1)
# Top-level sections only: a vertical stack's first child is the one that narrates.
top = re.findall(r'\n        <section[^>]*>(.*?)\n        </section>', slides, re.S)
notes = []
for sec in top:
    aside = re.search(r'<aside class="notes">(.*?)</aside>', sec, re.S)
    text = re.sub(r"<[^>]+>", " ", aside.group(1)) if aside else ""
    text = re.sub(r"^\s*\d+:\d\d\.\s*", "", text.strip())  # the timing mark is for the presenter
    text = re.sub(r"\s+", " ", text)
    notes.append(text)

only = {int(a) for a in sys.argv[1:]} or set(range(1, len(notes) + 1))
OUT.mkdir(exist_ok=True)
for n, text in enumerate(notes, 1):
    if n not in only or not text:
        continue
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": MODEL,
                         "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.2}}).encode(),
        headers={**HEADERS, "Accept": "audio/mpeg"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            (OUT / f"slide-{n}.mp3").write_bytes(r.read())
        print(f"slide-{n}.mp3  {len(text)} characters")
    except urllib.error.HTTPError as e:
        sys.exit(f"slide {n}: HTTP {e.code} {e.read()[:200]!r}")
print(f"{len(notes)} slides; files in {OUT.relative_to(ROOT)}")
