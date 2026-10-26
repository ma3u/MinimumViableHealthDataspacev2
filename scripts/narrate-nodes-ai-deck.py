#!/usr/bin/env python3
"""Narrate the NODES AI 2027 deck in English in the presenter's voice, with captions.

Reads ui/public/presentations/nodes-ai-2027/narration-source.json, where every
cue is one sentence: "text" is the caption, "say" (when present) is what the
voice speaks instead, for acronyms and URLs, and "frag" reveals that slide's
build step. Each slide goes to ElevenLabs' text-to-speech "with-timestamps"
endpoint, which returns the audio and the start time of every character; the
pitch for the call for speakers goes the same way as one more clip. Writes:

    audio/slide-N.mp3      the narration of slide N
    audio/pitch.mp3        the pitch, under a minute
    narration.json         cue times, captions and build steps, for the player and the video

Same pattern as scripts/narrate-euskadi-deck.py. The key comes from
ELEVENLABS_API_KEY in the environment, or from the repository's git-ignored
.env files, and is never printed. The voice is ELEVENLABS_VOICE_ID, or else the
account voice named in the source file.

Run from the repository root:

    python3 scripts/narrate-nodes-ai-deck.py                 # everything not already spoken
    python3 scripts/narrate-nodes-ai-deck.py guard pitch     # only these, spoken again
"""
import base64, hashlib, json, os, pathlib, sys, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DECK = ROOT / "ui/public/presentations/nodes-ai-2027"
SOURCE = DECK / "narration-source.json"
OUT_JSON = DECK / "narration.json"
FORMAT = "mp3_44100_128"


def load_dotenv(path: pathlib.Path) -> None:
    """KEY=VALUE lines into the environment, printing nothing; the shell wins."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip('"').strip("'"))


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

src = json.loads(SOURCE.read_text())
clips = [(s["id"], f"audio/slide-{n}.mp3", s["cues"]) for n, s in enumerate(src["slides"], 1)]
clips.append(("pitch", "audio/pitch.mp3", src["pitch"]))
only = set(sys.argv[1:])
unknown = only - {c[0] for c in clips}
if unknown:
    sys.exit(f"unknown ids: {', '.join(sorted(unknown))}")

voice = os.environ.get("ELEVENLABS_VOICE_ID")
if not voice:
    wanted = src["voice_name"].lower()
    req = urllib.request.Request("https://api.elevenlabs.io/v1/voices", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        voices = json.load(r)["voices"]
    match = [v for v in voices if v["name"].strip().lower() == wanted]
    if not match:
        sys.exit(f"no voice named {wanted!r}; the account has: " + ", ".join(v["name"] for v in voices))
    voice = match[0]["voice_id"]
    print(f"voice: {match[0]['name']}")

previous = {}
if OUT_JSON.is_file():
    old = json.loads(OUT_JSON.read_text())
    previous = {s["id"]: s for s in old["slides"]}
    if old.get("pitch"):
        previous["pitch"] = old["pitch"]
(DECK / "audio").mkdir(exist_ok=True)


def spoken(cue: dict) -> str:
    return cue.get("say", cue["text"])


def spoken_key(cues: list) -> str:
    """What the audio depends on: the spoken sentences, where they break, the model and the voice."""
    what = [[spoken(c) for c in cues], src["model"], src["voice_settings"]]
    return hashlib.sha256(json.dumps(what, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def timed(cues: list, times: list) -> list:
    """The source cues with their start and end; captions and build steps always come from the source."""
    out = []
    for cue, t in zip(cues, times):
        c = {"start": t["start"], "end": t["end"], "text": cue["text"]}
        for k in ("frag", "slide", "step"):
            if k in cue:
                c[k] = cue[k]
        out.append(c)
    return out


result = {}
for cid, audio, cues in clips:
    k = spoken_key(cues)
    old = previous.get(cid)
    if only and cid not in only:
        if old:  # not asked for this time: keep what was there, as it was
            result[cid] = old
        continue
    if old and not only and old.get("spoken") == k and (DECK / old["audio"]).is_file():
        result[cid] = {**old, "cues": timed(cues, old["cues"])}
        print(f"{cid:10s} audio kept, cues refreshed")
        continue
    # One request per clip; remember where each sentence starts in the spoken text.
    text, spans = "", []
    for cue in cues:
        if text:
            text += " "
        spans.append((len(text), len(text) + len(spoken(cue))))
        text += spoken(cue)
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format={FORMAT}",
        data=json.dumps({"text": text, "model_id": src["model"], "language_code": src["language"],
                         "voice_settings": src["voice_settings"]}).encode(),
        headers=HEADERS,
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            body = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"{cid}: HTTP {e.code} {e.read()[:300]!r}")
    (DECK / audio).write_bytes(base64.b64decode(body["audio_base64"]))
    al = body["alignment"]
    starts, ends = al["character_start_times_seconds"], al["character_end_times_seconds"]
    if len(al["characters"]) != len(text):
        sys.exit(f"{cid}: alignment has {len(al['characters'])} characters for {len(text)} sent")
    duration = round(ends[-1], 3)
    times = []
    for i, (a, _b) in enumerate(spans):
        # A caption stays up until the next sentence starts, so it never flickers off between them.
        end = starts[spans[i + 1][0]] if i + 1 < len(spans) else duration
        times.append({"start": round(starts[a], 3), "end": round(end, 3)})
    result[cid] = {"id": cid, "audio": audio, "duration": duration, "spoken": k, "cues": timed(cues, times)}
    print(f"{cid:10s} {duration:6.1f}s  {len(text)} characters")

slides = [result[s["id"]] for s in src["slides"] if s["id"] in result]
OUT_JSON.write_text(json.dumps({"language": src["language"], "slides": slides, "pitch": result.get("pitch")},
                               ensure_ascii=False, indent=1) + "\n")
total = sum(s["duration"] for s in slides)
pitch = f"pitch {result['pitch']['duration']:.1f}s" if "pitch" in result else "no pitch"
print(f"{len(slides)} slides, {int(total // 60)}:{int(total % 60):02d} of narration; {pitch}; {OUT_JSON.relative_to(ROOT)}")
