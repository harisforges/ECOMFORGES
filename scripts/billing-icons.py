#!/usr/bin/env python3
"""
Derive ForgeBilling's home-screen icons from the calculator's.

Sixth tool, sixth icon. The calculator is cyan, the analyst amber, LeadForge green and ForgeMarketing red
and ForgeBilling red — four EcomForges apps sitting next to each other on a phone
home screen need to be distinguishable before they are opened, and at 48px the colour
is the only thing doing that job.

The shape is not redrawn, for the same reason scripts/marketing-icons.py does not redraw it:
a second-hand copy of the hexagon would drift from the brand in ways nobody notices
until it sits beside the original. Pixels are matched by how far they sit from the navy
ground, and only the accent hue moves along a new ramp, so the silhouette, the gradient
and the anti-aliased edges survive exactly.

Blue #3B82F6 fills the last wide gap on the wheel. It sits nearest the calculator's cyan,
so it is deliberately a saturated true blue rather than an azure: at icon size the
difference has to survive being 48px on a phone.

    python3 scripts/billing-icons.py       # writes into the repo root

Requires Pillow. Re-run only if the calculator's icons change.
"""

from pathlib import Path
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover - a developer aid, not part of the build
    sys.exit('Pillow is required: pip install Pillow')

ROOT = Path(__file__).resolve().parents[1]

# The navy ground, and the two ends of the new accent ramp: #FF3D57, darkened for the low
# end so the original's depth is preserved rather than flattened.
NAVY = (22, 40, 64)
RAMP_DARK = (10, 36, 99)
RAMP_BRIGHT = (59, 130, 246)

# Each calculator icon and the ForgeBilling icon derived from it.
PAIRS = [
    ('icon-192.png', 'billing-icon-192.png'),
    ('icon-512.png', 'billing-icon-512.png'),
    ('icon-maskable-512.png', 'billing-icon-maskable-512.png'),
    ('apple-touch-icon.png', 'billing-apple-touch-icon.png'),
]

# The browser-tab favicon. Without it ForgeBilling would carry the calculator's cyan
# mark and the two tabs would be indistinguishable.
FAVICON = ('billing-icon-192.png', 'billing-favicon.png', 64)


def recolour(src: Path, dst: Path) -> None:
    """Keep the hexagon exactly; move only its accent along the red ramp."""
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
                round(RAMP_DARK[0] + (RAMP_BRIGHT[0] - RAMP_DARK[0]) * t),
                round(RAMP_DARK[1] + (RAMP_BRIGHT[1] - RAMP_DARK[1]) * t),
                round(RAMP_DARK[2] + (RAMP_BRIGHT[2] - RAMP_DARK[2]) * t),
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
