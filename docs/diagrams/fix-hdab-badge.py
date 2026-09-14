"""Corrects the HDAB badge caption in the EHDS journey infographic.

The generated image reads "Health Oata Access Body" and "Firgonbmío de Accces
a Datos de Salud". Two words of that are not Spanish and one is not English,
which is a poor look on a slide shown to a Spanish regulator.

Erasing the old caption means knowing where the navy circle ends on each row,
and the obvious way of probing for it does not work. Scanning inward from the
margin stops on the page frame, which is the same navy, and paints the white
between frame and circle. Walking outward from the centre stops inside the
caption itself, because a run of light glyph pixels looks exactly like having
left the circle, which leaves half of each line of old text standing.

So the circle is measured rather than probed: its edges are read on rows above
and below the caption, where nothing obscures them, a circle is fitted to
those, and every row in between is filled to the fitted width. The fit is
checked against rows it was not built from before anything is painted.
"""
import os
import sys
from math import sqrt

from PIL import Image, ImageDraw, ImageFont

SRC, DST = sys.argv[1], sys.argv[2]
FONT = "/System/Library/Fonts/Avenir Next.ttc"

CENTRE_X = 2490
BAND = range(1388, 1449)                 # rows holding the caption
# Rows inside the circle that nothing overlaps: above the caption but below
# the big "HDAB", and below the caption but above the circle's bottom. The
# first and last are the fit; the ones between are the check.
CLEAN = [1382, 1384, 1386, 1450, 1455, 1465, 1460]
LINES = ["Health Data Access Body", "Organismo de Acceso", "a Datos de Salud"]

im = Image.open(SRC).convert("RGB")
px = im.load()


def navy(c):
    r, g, b = c
    return 85 < b < 140 and r < 90 and g < 110 and b - r > 30


def half_width(y):
    """Distance from the centre to the circle edge on a caption-free row."""
    x = CENTRE_X
    while navy(px[x + 1, y]):
        x += 1
    return x - CENTRE_X


# Fit centre_y and radius from two clean rows, then verify on the others.
ya, yb = min(CLEAN), max(CLEAN)
wa, wb = half_width(ya), half_width(yb)
# wa² = R² - (ya-cy)² and wb² = R² - (yb-cy)² solve to a linear equation in cy.
cy = ((yb * yb - ya * ya) + (wb * wb - wa * wa)) / (2 * (yb - ya))
r2 = wa * wa + (ya - cy) ** 2

for y in sorted(CLEAN)[1:-1]:
    predicted = sqrt(r2 - (y - cy) ** 2)
    measured = half_width(y)
    assert abs(predicted - measured) <= 2, (
        f"circle fit is wrong at y={y}: predicted {predicted:.1f}, "
        f"measured {measured}. Refusing to paint.")

print(f"circle: centre_y={cy:.1f} radius={sqrt(r2):.1f}, verified on "
      f"{len(CLEAN) - 2} other rows")

for y in BAND:
    w = int(sqrt(r2 - (y - cy) ** 2)) - 2
    left, right = CENTRE_X - w, CENTRE_X + w
    # Sample the ground from the clean margin inside the edge. The caption is
    # centred and never reaches within 20 px of the circle, so this is navy.
    margin = [px[x, y] for x in range(left + 1, left + 13)]
    margin += [px[x, y] for x in range(right - 12, right)]
    margin.sort(key=sum)
    ground = margin[len(margin) // 2]
    assert navy(ground), f"row {y}: margin is not navy ({ground}), refusing"
    for x in range(left, right + 1):
        px[x, y] = ground

if os.environ.get("ERASE_ONLY"):
    im.save(DST)
    print("erase only")
    raise SystemExit

draw = ImageDraw.Draw(im)
# Size chosen to match the original caption: line one measured 204 px wide.
size = 19
while size > 10:
    font = ImageFont.truetype(FONT, size, index=0)
    if draw.textlength(LINES[0], font=font) <= 206:
        break
    size -= 1

top, leading = 1389, 21
for i, line in enumerate(LINES):
    w = draw.textlength(line, font=font)
    draw.text((CENTRE_X - w / 2, top + i * leading), line,
              font=font, fill=(226, 233, 240))

# Flat vector-style art, so a 256-colour palette is visually lossless here
# (mean per-channel error 0.95 of 255) and takes the file from 3.9 MB to 1.4.
im.convert("RGB").quantize(colors=256).save(DST, optimize=True)
print(f"redrew {len(LINES)} lines at {size}px into {DST}")
