# Painting with the krita-painting skill: worked notes

## A plan, written before any step runs

Write the whole picture as a list of calls first, in canvas pixels, and look at it as a list of shapes before
running it. A useful order:

| Pass | Calls | Brushes |
|---|---|---|
| Ground | `fill_canvas`, `gradient` | |
| Far to near | `fill` per shape | |
| Light | `mask`, strokes, `clear_mask` | `Airbrush` 60 to 220, opacity 20 to 40 |
| Texture | strokes along the forms | `Bristles-1`, `Bristles-2`, `Wet Paint`, `Chalk Soft` |
| Nature | strokes | `Stamp Grass`, `Stamp Leaves`, `Stylised Tree`, `Starfield` |
| Details | strokes, `dab` | `Fineliner`, `Gpen`, `Pencil-2` at 2 to 8 |
| Finish | big soft strokes at the edges (a vignette) | `Airbrush` 220, opacity 20 |

## Shapes

- An outline is a list of points; `fill` closes it. 10 to 40 points give a good curve with `smooth`; use
  `smooth: false` for buildings, horizons and anything with corners.
- A stroke is always a smooth line through its points: for a sharp corner, paint two strokes.
- A circle of radius r at (cx, cy): 8 to 16 points at angles 0, 2*pi/n, ... (`smooth` rounds it).
- Shapes may run past the canvas edge (to -10 or 910): the frame pulls the points back to the edge, so a sea or a
  sky covers the canvas to its border.
- Later fills cover earlier ones: paint the far shapes first.

## Light

- Pick one light direction and keep it: shadows on the far side of every form, highlights on the near side.
- Shade inside a `mask`: the airbrush can then sweep across the edge without leaving the shape.
- Distance turns pale and cool (aerial perspective): a light `Airbrush` haze over far hills.

## Colour palettes that worked

| Picture | Colours |
|---|---|
| Sunset sea (`main`) | sky `#2c3e73`, glow `#f6b26b`, sun `#ffd27a`, sea `#1f4e79`, birds `#1b1b2f` |
| Renaissance portrait (the Mona Lisa) | haze `#cfc79c`, sky `#6f8b85`, far mountains `#a3b3a6`, hills `#868150`, dress `#222319`, skin `#dcb27c`, shadow `#b2834f`, light `#f3dcae`, hair `#2a1c11`, gold `#b48d4e` |
| Lighthouse at dusk (the example) | sky `#1d2b53`, coral `#e76f51`, glow `#f4a261`, stars `#fdf6e3` (`Starfield` 100), sea `#264653` to `#2a9d8f`, cliff `#2b2d42`, tower `#f1faee` and `#e63946`, lamp `#ffd166`, beams `#fff3b0` |
| Night sky | sky `#0b1d3a` to `#1f3b6f`, stars `#f5f1d0` (`Starfield` 120), moon `#f2ecd0` |

## Timings measured on prod (4c8g)

| Call | Time |
|---|---|
| `color` | about 1.5 s |
| `brush` (with its size) | about 4.5 s |
| `size`, `opacity` | about 3.3 s |
| `fill`, `mask` | about 1.2 s |
| `stroke` | 0.3 to 1 s, longer paths take longer |
| `export` | about 4 s |
| `setup` on a new capsule | about 105 s: installing Krita about 80 s, starting it about 25 s |
| The sunset (`main`, 20 calls) | about 22 s |
| The lighthouse (114 calls, about 600 steps) | about 125 s |
