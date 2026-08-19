# Mori avatar assets

Export Mori (the HeyMori character) as **transparent PNGs** and place them here.
The `<Mori>` component loads `/mori/<expression>.png`. Until a file exists it
renders nothing (no broken image), so you can add these incrementally.

Recommended: square canvas, transparent background, ~512×512 (retina-friendly).
Keep the SAME character across all of them — only pose/expression changes.

Expected filenames (map to `MoriExpression` in `src/components/Mori.tsx`):

- `waving.png`      — landing hero
- `searching.png`   — guest selfie screen (magnifying glass)
- `celebrating.png` — "found you!" success screen
- `smiling.png`     — default
- `excited.png`
- `pointing.png`
- `thinking.png`
- `phone.png`       — holding a phone
- `photos.png`      — looking at photos
- `confused.png`
- `sorry.png`       — error / no results
- `sleeping.png`    — loading / empty

Already wired in: `waving` (landing), `searching` + `celebrating` (guest flow).
