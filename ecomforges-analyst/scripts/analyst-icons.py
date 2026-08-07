#!/usr/bin/env python3
"""
Derive the analyst's home-screen icons from the calculator's.

The two tools live on the same origin and sit next to each other on a phone's home screen,
so they need different icons — otherwise the only way to tell them apart is to open one.
But drawing a second mark by hand would drift from the brand: the hexagon would end up
subtly the wrong proportion, and nobody would notice until it sat beside the original.

So the shape is not redrawn at all. Pixels are matched by how far they sit from the navy
ground, and only the accent hue moves along a new ramp. The silhouette, the gradient and
the anti-aliased edges all survive exactly; the icon reads as the same family in a
different colour, which is what a second tool from one consultancy should look like.

Amber over green or blue for one practical reason: at 48px on a navy home screen, amber is
the only one of the three that is unmistakable at a glance.

    python3 scripts/analyst-icons.py          # writes into the repo root

Requires Pillow. Re-run only if the calculator's icons change.
"""

from pathlib import Path
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover - a developer aid, not part of the build
    sys.exit('Pillow is required: pip install Pillow')

ROOT = Path(__file__).resolve().parents[2]

# The navy ground, and the two ends of the new accent ramp: --amber #F6A820, darkened for
# the low end so the original's depth is preserved rather than flattened.
NAVY = (22, 40, 64)
RAMP_DARK = (99, 63, 5)
RAMP_BRIGHT = (246, 168, 32)

# Each calculator icon and the analyst icon derived from it.
PAIRS = [
    ('icon-192.png', 'analyst-icon-192.png'),
    ('icon-512.png', 'analyst-icon-512.png'),
    ('icon-maskable-512.png', 'analyst-icon-maskable-512.png'),
    ('apple-touch-icon.png', 'analyst-apple-touch-icon.png'),
]

# The browser-tab favicon, which build-page.ts inlines as a data URI. Without it the analyst
# would carry the calculator's cyan mark and the two tabs would be indistinguishable.
FAVICON = ('analyst-icon-192.png', 'analyst-favicon.png', 64)


def recolour(src: Path, dst: Path) -> None:
    """Keep the hexagon exactly; move only its accent along the amber ramp."""
    img = Image.open(src).convert('RGBA')
    px = img.load()
    w, h = img.size

    # Distance from navy, normalised over the image's own range, so the mapping adapts to
    # whichever icon is being converted instead of assuming a fixed contrast.
    def dist(p: tuple[int, int, int, int]) -> float:
        return sum((p[i] - NAVY[i]) ** 2 for i in range(3)) ** 0.5

    peak = max((dist(px[x, y]) for y in range(h) for x in range(w)), default=1.0) or 1.0

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            t = min(dist((r, g, b, a)) / peak, 1.0)
            if t < 0.06:
                continue  # navy ground and near-navy: leave untouched
            px[x, y] = (
                round(NAVY[0] + (RAMP_DARK[0] + (RAMP_BRIGHT[0] - RAMP_DARK[0]) * t - NAVY[0]) * 1.0),
                round(NAVY[1] + (RAMP_DARK[1] + (RAMP_BRIGHT[1] - RAMP_DARK[1]) * t - NAVY[1]) * 1.0),
                round(NAVY[2] + (RAMP_DARK[2] + (RAMP_BRIGHT[2] - RAMP_DARK[2]) * t - NAVY[2]) * 1.0),
                a,
            )

    img.save(dst, 'PNG', optimize=True)
    print(f'{dst.name}  <- {src.name}  ({dst.stat().st_size:,} bytes)')


if __name__ == '__main__':
    for src_name, dst_name in PAIRS:
        src = ROOT / src_name
        if not src.exists():
            sys.exit(f'missing {src} — run this from the repository')
        recolour(src, ROOT / dst_name)

    src_name, dst_name, size = FAVICON
    fav = Image.open(ROOT / src_name).convert('RGBA').resize((size, size), Image.LANCZOS)
    fav.save(ROOT / dst_name, 'PNG', optimize=True)
    print(f'{dst_name}  <- {src_name} at {size}px  ({(ROOT / dst_name).stat().st_size:,} bytes)')
