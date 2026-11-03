#!/usr/bin/env python3
"""Narrate the EJIE deck in the presenter's voice: Spanish with Basque subtitles, or English.

Reads ui/public/presentations/euskadi-ejie-2026/narration-source.json, where
every cue is one sentence: "es" is spoken, "eu" is the Basque subtitle shown
while it plays, and "frag" reveals that slide's fragment. Each slide goes to
ElevenLabs' text-to-speech "with-timestamps" endpoint, which returns the audio
and the start time of every character. The script writes:

    audio/<id>.mp3               the Spanish narration of the slide with that id
    subtitles/<id>.eu.vtt        Basque WebVTT, one cue per spoken sentence
    narration.json               cue times, subtitles and fragments, for the player

and with --lang en, from each cue's "en", audio/en/<id>.mp3 and narration.en.json
(no subtitles). The deck plays the narration of the language it is shown in.

ElevenLabs has no Basque voice (checked on 2026-10-10 against every model the
account offers), so the audio is Spanish and Basque is the subtitle language.

The key comes from ELEVENLABS_API_KEY in the environment, or from the
repository's git-ignored .env files, and is never printed. The voice is
ELEVENLABS_VOICE_ID, or else the account voice named in the source file.

Run from the repository root:

    python3 scripts/narrate-euskadi-deck.py              # every slide
    python3 scripts/narrate-euskadi-deck.py q3 pilot1    # only these slide ids
    python3 scripts/narrate-euskadi-deck.py --lang en    # the English narration
"""
import base64, hashlib, json, os, pathlib, shutil, sys, time, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DECK = ROOT / "ui/public/presentations/euskadi-ejie-2026"
SOURCE = DECK / "narration-source.json"
# The source file's "voice_settings" win; these were the first version's, which Spanish
# listeners found too slow and too flat.
DEFAULT_VOICE_SETTINGS = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.2}
OUT_JSON = DECK / "narration.json"
FORMAT = "mp3_44100_96"


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


def vtt_time(t: float) -> str:
    h, rest = divmod(t, 3600)
    m, s = divmod(rest, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


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

ARGS = sys.argv[1:]
LANG = "es"
if "--lang" in ARGS:
    i = ARGS.index("--lang")
    LANG = ARGS[i + 1]
    del ARGS[i : i + 2]
# Spanish keeps the original paths; another language gets its own folder and file.
AUDIO = "audio" if LANG == "es" else f"audio/{LANG}"
SUBS = LANG == "es"
if LANG != "es":
    OUT_JSON = DECK / f"narration.{LANG}.json"

previous = {}
if OUT_JSON.is_file():
    previous = {s["id"]: s for s in json.loads(OUT_JSON.read_text())["slides"]}
only = set(ARGS)
unknown = only - {s["id"] for s in src["slides"]}
if unknown:
    sys.exit(f"unknown slide ids: {', '.join(sorted(unknown))}")

(DECK / AUDIO).mkdir(parents=True, exist_ok=True)
(DECK / "subtitles").mkdir(exist_ok=True)


def spoken_key(slide: dict) -> str:
    """What the audio depends on: the sentences, where they break, the model and the voice settings.

    Subtitles and fragment indices are not in it, so changing those reuses the audio.
    """
    what = [[c[LANG] for c in slide["cues"]], src["model"], src.get("voice_settings", DEFAULT_VOICE_SETTINGS)]
    return hashlib.sha256(json.dumps(what, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def write_vtt(sid: str, cues: list) -> None:
    if not SUBS:
        return
    vtt = ["WEBVTT", "Language: eu", ""]
    for c in cues:
        vtt += [f"{vtt_time(c['start'])} --> {vtt_time(c['end'])}", c["eu"], ""]
    (DECK / f"subtitles/{sid}.eu.vtt").write_text("\n".join(vtt))


result = []
for n, slide in enumerate(src["slides"], 1):
    sid = slide["id"]
    key = spoken_key(slide)
    old = previous.get(sid)
    if old and old.get("spoken") == key and (DECK / old["audio"]).is_file():
        # Same words, same breaks: keep the audio and its times, take the subtitles and builds anew.
        cues = []
        for cue, t in zip(slide["cues"], old["cues"]):
            c = {"start": t["start"], "end": t["end"], "eu": cue["eu"]}
            if "frag" in cue:
                c["frag"] = cue["frag"]
            cues.append(c)
        # Files are named by slide id, so a slide keeps its audio when the deck is reordered.
        audio = f"{AUDIO}/{sid}.mp3"
        if old["audio"] != audio:
            shutil.copyfile(DECK / old["audio"], DECK / audio)
        write_vtt(sid, cues)
        entry = {**old, "audio": audio, "cues": cues}
        if SUBS:
            entry["subtitles"] = f"subtitles/{sid}.eu.vtt"
        result.append(entry)
        print(f"slide {n:2d} {sid:10s} audio kept, cues refreshed")
        continue
    if only and sid not in only and old:
        result.append(previous[sid])
        continue
    # One request per slide; remember where each sentence starts in the text.
    text, spans = "", []
    for cue in slide["cues"]:
        if text:
            text += " "
        spans.append((len(text), len(text) + len(cue[LANG])))
        text += cue[LANG]
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format={FORMAT}",
        data=json.dumps({"text": text, "model_id": src["model"],
                         "voice_settings": src.get("voice_settings", DEFAULT_VOICE_SETTINGS)}).encode(),
        headers=HEADERS,
    )
    # A long run meets the odd dropped connection; try a slide three times before giving up.
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                body = json.load(r)
            break
        except urllib.error.HTTPError as e:
            sys.exit(f"{sid}: HTTP {e.code} {e.read()[:300]!r}")
        except (ConnectionError, TimeoutError, urllib.error.URLError) as e:
            if attempt == 2:
                sys.exit(f"{sid}: {e}")
            print(f"{sid}: {e}, retrying")
            time.sleep(5 * (attempt + 1))
    audio = f"{AUDIO}/{sid}.mp3"
    (DECK / audio).write_bytes(base64.b64decode(body["audio_base64"]))
    al = body["alignment"]
    starts, ends = al["character_start_times_seconds"], al["character_end_times_seconds"]
    if len(al["characters"]) != len(text):
        sys.exit(f"{sid}: alignment has {len(al['characters'])} characters for {len(text)} sent")
    duration = round(ends[-1], 3)
    cues = []
    for i, (cue, (a, b)) in enumerate(zip(slide["cues"], spans)):
        start = round(starts[a], 3)
        # A subtitle stays up until the next sentence starts, so it never flickers off between them.
        end = round(starts[spans[i + 1][0]] if i + 1 < len(spans) else duration, 3)
        c = {"start": start, "end": end, "eu": cue["eu"]}
        if "frag" in cue:
            c["frag"] = cue["frag"]
        cues.append(c)
    write_vtt(sid, cues)
    result.append({"id": sid, "audio": audio, **({"subtitles": f"subtitles/{sid}.eu.vtt"} if SUBS else {}),
                   "duration": duration, "spoken": key, "cues": cues})
    print(f"slide {n:2d} {sid:10s} {duration:6.1f}s  {len(text)} characters")

OUT_JSON.write_text(json.dumps({"language": LANG, **({"subtitles": "eu"} if SUBS else {}), "slides": result},
                               ensure_ascii=False, indent=1) + "\n")
# Drop the files no slide uses any more, such as the numbered names of earlier versions.
used = {s["audio"] for s in result} | {s.get("subtitles") for s in result}
for f in [*(DECK / AUDIO).glob("*.mp3"), *((DECK / "subtitles").glob("*.vtt") if SUBS else [])]:
    if str(f.relative_to(DECK)) not in used:
        f.unlink()
total = sum(s["duration"] for s in result)
print(f"{len(result)} slides, {int(total // 60)}:{int(total % 60):02d} of narration; {OUT_JSON.relative_to(ROOT)}")
