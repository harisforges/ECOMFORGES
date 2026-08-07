# Brand assets

Vector re-draws of the primary EcomForges logo, traced from the 958×147 white
PNG lockup that is embedded in `index.html`. Geometry, proportions, spacing and
colour are unchanged — the SVGs re-render to within a mean error of 0.15/255 of
the original raster.

## Files

| File | Contents | Notes |
| --- | --- | --- |
| `ecomforges-logo.svg` | Icon + wordmark lockup | `viewBox="0 0 958 147"`, aspect 6.517 |
| `ecomforges-mark.svg` | Icon only | `viewBox="0 8.5 120.688 131.562"`, aspect 0.917 |
| `ecomforges-logo-{32,64,96,128}h.png` | Lockup raster | 1×–4× of a 32 px header |
| `ecomforges-mark-{32,64,96,128}.png` | Icon raster | 1×–4× of a 32 px mark |

Prefer the SVGs. The PNGs are there for contexts that cannot take vector input.

## Geometry

Both files are cropped to the ink: the visible pixels touch all four edges of
the viewBox, so there is no built-in padding. Any breathing room around the
logo belongs in the layout, not the asset.

The two SVGs share one coordinate space — the mark is the lockup's icon under a
tighter `viewBox`, not a re-scaled copy — so icon and wordmark keep their
original relative size and spacing.

## Colour

The icon carries a single linear gradient, `#0A4147` → `#00E6FF`, along the
lockup-space vector `(-52.20, 58.59) → (31.79, -35.68)`. That gradient was
fitted to the source pixels and reproduces them to within 2/255 per channel.
The wordmark is pure `#FFFFFF`.

Both are designed for dark backgrounds. There is no light-background variant —
the wordmark would disappear on one.

## Usage

```html
<img src="assets/ecomforges-logo.svg" alt="EcomForges" height="28">
```

Set only `height` and let the width follow; the intrinsic `width`/`height` on
the root element are there so the browser can reserve space before load.

The gradient uses the id `ef-g`. If you inline both SVGs into the same
document, rename it in one of them — duplicate ids in a single document make
the gradient resolve to whichever came first.

## Regenerating

Traced with `potrace` at 3× supersampling (`-a 1.2 -O 0.4 -t 4`), coordinates
baked to 2 decimals in source-pixel space. The source of truth remains the
base64 PNG in `index.html`, which is unchanged — it is used by the in-page PDF
export, which needs a raster.
