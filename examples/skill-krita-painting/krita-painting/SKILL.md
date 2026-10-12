---
name: krita-painting
description: Paint pictures in Krita 5 on a Linux desktop capsule with real brushes (lasso fills, airbrush shading inside masks, bristle, ink, watercolour and stamp brushes) on a 900x1200 portrait canvas, in canvas pixels. Use when asked to draw or paint a picture, a portrait, a landscape or an illustration in Krita.
compatibility: A Capsulate Linux desktop capsule (Ubuntu 22.04, 1280x800 screen) with Krita 5.0.2; the procedures run through Capsulate's skill runner.
metadata:
  learned-from: "The Mona Lisa test on 2026-10-12: about an hour the first time, 4.4 minutes for the final run of 1,170 steps"
  app: "Krita 5.0.2 (Ubuntu 22.04, apt)"
---

# Painting in Krita

This skill paints on a **900 x 1200 pixel portrait canvas**. Every coordinate you give is in canvas pixels: (0, 0)
is the top-left corner, (900, 1200) the bottom-right. The skill's `canvas` frame maps them to the screen, and keeps
every stroke on the canvas (a point a little outside is pulled back to the edge).

The capsule is ready when it was launched for this skill: Krita is installed and open, the view is set, and the
brush tool is active. On another capsule, call `setup` first.

## The procedures

Call them with `use` steps, in a run (`POST /runs` with `steps`) or in `run_actions`:

```json
{"do": "use", "procedure": "color", "args": {"hex": "#2c3e73"}}
```

| Procedure | Args | What it does |
|---|---|---|
| `color` | `hex` | Sets the foreground colour: what fills, strokes and the gradient use |
| `brush` | `preset`, `size` | Picks a brush and its size in canvas pixels; also selects the brush tool |
| `size` | `px` | Changes the brush size |
| `opacity` | `percent` | Changes the brush opacity (picking a preset resets it) |
| `fill` | `path`, `smooth` | Fills an outline with the colour (closed for you); `smooth: false` for straight edges |
| `fill_canvas` | | Fills the whole canvas with the colour |
| `mask` | `path`, `smooth` | Selects an outline and keeps it: the strokes after it only paint inside |
| `clear_mask` | | Drops the selection |
| `stroke` | `path` | A brush stroke: a smooth line through at least 2 points (2 give a straight line) |
| `dab` | `x`, `y` | One touch of the brush: a pupil, a star, a highlight |
| `gradient` | `from`, `to` | From the colour at `from` to transparent at `to`, over what is painted |
| `undo` | | Takes back the last step of Krita's history |
| `export` | `file` | Writes a 900 x 1200 PNG to `/home/capsulate/Pictures/<file>` |
| `main` | the skill's inputs | A small sunset over the sea, exported: proof the skill works |

Brush presets: `Airbrush` (soft shading and haze), `Basic-1` (round and hard), `Pencil-2`, `Fineliner`, `Gpen`
(ink), `Bristles-1` (fine bristles), `Bristles-2` (flat and rough), `Bristles-3` (large and smooth), `Wet Paint`,
`Watercolor Texture`, `Chalk Soft`, and stamps that paint nature in one stroke: `Stamp Grass`, `Stamp Leaves`,
`Stylised Tree`, `Starfield` (stars on a dark sky).

## How to paint a picture

Work back to front, broad to fine, as a painter does:

1. **Plan the picture first** in canvas pixels: the shapes, their colours, the light's direction. Planning is
   where the time goes; the painting itself runs at about 4 steps a second.
2. **The background:** `fill_canvas` with the far colour, then a `gradient` for the sky.
3. **Large shapes, back to front,** with `fill`: mountains, water, land, then the subject. Give outlines
   10 to 40 points; `smooth` makes a curve through them.
4. **Light and volume:** `mask` a shape, then `Airbrush` strokes inside it (size 60 to 200, opacity 20 to 40),
   darker on the shadow side and lighter on the lit side. `clear_mask` when done.
5. **Texture and nature:** bristle brushes along the forms; the stamps for grass, leaves and trees.
6. **Details last** with `Fineliner`, `Gpen` or `Pencil-2` at sizes 2 to 8: eyes, edges, birds, ripples.
7. **Export** the PNG, then download it with the files API.

Group the work by brush and colour: a `color` call takes about 1.5 seconds and a `brush` call about 4.5 seconds,
while a fill takes about 1.2 seconds and a stroke 0.3 to 1 second. The lighthouse in the example, 114 calls, paints
in about 2 minutes; a detailed picture of 150 to 300 calls runs in 3 to 6 minutes.

## What went wrong while learning (handled for you)

- A lasso pressed inside the current selection moves that selection: `fill` and `mask` deselect first.
- Krita scrolls the view when a drag nears the window's edge: the 42% view leaves a margin, and the frame clamps
  every point.
- A selection keeps confining the strokes after a fill: `fill` deselects at its end; `mask` keeps it on purpose.
- The gradient fades to transparent, not to the background colour: fill the canvas with the far colour first.
- A fill sent right after the lasso finds no selection yet: `fill` and `mask` wait 300 ms after it.
- A stroke sent as bare points paints only where the pointer stops: `stroke` samples the line every few pixels.
- A deselect is a step of its own in Krita's history: undoing a whole `fill` takes three `undo` calls.

See `references/painting.md` for a worked plan (the sunset in `main`) and colour palettes that worked.
