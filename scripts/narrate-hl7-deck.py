#!/usr/bin/env python3
"""Narrate the HL7 showcase deck in the presenter's own voice, one file per slide.

Reads the speaker notes of every top-level slide in the deck, sends each to
ElevenLabs, and writes ui/public/presentations/hl7-showcase-2026/audio/slide-N.mp3.
The deck's "Narration" button plays them as the slides come up.

A slide whose notes mark its builds with "▸" is spoken through the
with-timestamps endpoint: the marks are not spoken, and the time each marked
sentence starts goes to audio/cues.json, so the player shows that slide's
fragments in order as the voice reaches them.

The key comes from ELEVENLABS_API_KEY in the environment, or from the
repository's git-ignored .env, and is never written anywhere. The voice is
ELEVENLABS_VOICE_ID, or else the account's voice named ELEVENLABS_VOICE_NAME
("Mabu Engaged" by default), looked up through the API.

Run from the repository root:

    python3 scripts/narrate-hl7-deck.py            # every slide
    python3 scripts/narrate-hl7-deck.py 3 7        # only slides 3 and 7
"""
import base64, json, os, pathlib, re, sys, urllib.request

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


def main_checkout() -> pathlib.Path:
    """The main working tree, where the git-ignored .env lives when this runs in a worktree."""
    common = ROOT / ".git"
    if common.is_file():  # a worktree: .git is a file pointing into the main repository
        gitdir = pathlib.Path(common.read_text().split("gitdir:", 1)[1].strip())
        return gitdir.parent.parent.parent
    return ROOT


for base in dict.fromkeys((ROOT, main_checkout())):
    for candidate in (base / ".env", base / "docs/.env", base / "ui/.env"):
        load_dotenv(candidate)
key = os.environ.get("ELEVENLABS_API_KEY")
if not key:
    sys.exit("no ELEVENLABS_API_KEY in the environment or in .env")
HEADERS = {"xi-api-key": key, "Content-Type": "application/json"}

voice = os.environ.get("ELEVENLABS_VOICE_ID")
if not voice:
    # Resolve the voice by its name in the account, "Matthias" unless told otherwise.
    wanted = os.environ.get("ELEVENLABS_VOICE_NAME", "Mabu Engaged").lower()
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
CUES = OUT / "cues.json"
cues = json.loads(CUES.read_text()) if CUES.is_file() else {}
SETTINGS = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.2}
for n, text in enumerate(notes, 1):
    if n not in only or not text:
        continue
    marked = "▸" in text
    spoken, marks = "", []
    for i, part in enumerate(re.split(r"\s*▸\s*", text)):
        if i:
            spoken += " "
            marks.append(len(spoken))
        spoken += part
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"
    url += ("/with-timestamps" if marked else "") + "?output_format=mp3_44100_128"
    req = urllib.request.Request(
        url,
        data=json.dumps({"text": spoken, "model_id": MODEL, "voice_settings": SETTINGS}).encode(),
        headers={**HEADERS, "Accept": "application/json" if marked else "audio/mpeg"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"slide {n}: HTTP {e.code} {e.read()[:200]!r}")
    if marked:
        body = json.loads(body)
        starts = body["alignment"]["character_start_times_seconds"]
        if len(starts) != len(spoken):
            sys.exit(f"slide {n}: alignment has {len(starts)} characters for {len(spoken)} sent")
        cues[str(n)] = [round(starts[m], 2) for m in marks]
        (OUT / f"slide-{n}.mp3").write_bytes(base64.b64decode(body["audio_base64"]))
    else:
        cues.pop(str(n), None)
        (OUT / f"slide-{n}.mp3").write_bytes(body)
    print(f"slide-{n}.mp3  {len(spoken)} characters" + (f", builds at {cues[str(n)]} s" if marked else ""))
# One slide per line, as Prettier writes it.
CUES.write_text("{\n" + ",\n".join(f'  "{k}": {json.dumps(v)}' for k, v in sorted(cues.items(), key=lambda kv: int(kv[0]))) + "\n}\n")
print(f"{len(notes)} slides; files in {OUT.relative_to(ROOT)}")
