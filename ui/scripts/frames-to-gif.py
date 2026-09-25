#!/usr/bin/env python3
"""Assemble the frames a recording script wrote into one GIF.

    python3 scripts/frames-to-gif.py <frames dir> <out.gif> [--colors 128]

The directory holds frame-NNN.png and frames.json (a duration in ms per
frame, as scripts/record-researcher-journey.ts writes them). One palette for
the whole animation keeps the colours steady from frame to frame.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir")
    ap.add_argument("out")
    ap.add_argument("--colors", type=int, default=128)
    args = ap.parse_args()
    src = Path(args.frames_dir)
    durations = json.loads((src / "frames.json").read_text())
    files = sorted(src.glob("frame-*.png"))
    if len(files) != len(durations):
        print(f"{len(files)} frames but {len(durations)} durations", file=sys.stderr)
        return 1
    frames = [Image.open(f).convert("RGB") for f in files]
    # one palette from a strip of every frame
    w, h = frames[0].size
    strip = Image.new("RGB", (w, h * len(frames)))
    for i, f in enumerate(frames):
        strip.paste(f, (0, i * h))
    palette = strip.quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT)
    quantized = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    quantized[0].save(
        args.out,
        save_all=True,
        append_images=quantized[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=1,
    )
    size = Path(args.out).stat().st_size
    print(f"{args.out}: {len(frames)} frames, {sum(durations) / 1000:.1f} s, {size / 1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
