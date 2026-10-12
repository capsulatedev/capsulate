// A new picture for the krita-painting skill: a lighthouse at dusk, as a plan of calls to the skill's procedures in
// canvas pixels (900 x 1200, top-left 0, 0). Nothing here knows where Krita's buttons are: the skill does.
//
// The plan is what an AI writes after reading the skill's SKILL.md: shapes back to front, light inside masks,
// texture, details, a finish. It is plain data, so you can print it, change it, or have your own agent write one.

export type Point = [number, number];
export type UseStep = { do: "use"; procedure: string; args?: Record<string, unknown> } | { do: "say"; text: string };

const use = (procedure: string, args?: Record<string, unknown>): UseStep => (args ? { do: "use", procedure, args } : { do: "use", procedure });
const say = (text: string): UseStep => ({ do: "say", text });
const color = (hex: string) => use("color", { hex });
const brush = (preset: string, size: number) => use("brush", { preset, size });
const fill = (path: Point[], smooth = true) => use("fill", { path, smooth });
const mask = (path: Point[], smooth = true) => use("mask", { path, smooth });
const stroke = (path: Point[]) => use("stroke", { path });

// A circle as n points (fill and mask round it with smooth).
const circle = (cx: number, cy: number, r: number, n = 12): Point[] =>
  Array.from({ length: n }, (_, i) => [Math.round(cx + r * Math.cos((2 * Math.PI * i) / n)), Math.round(cy + r * Math.sin((2 * Math.PI * i) / n))]);
// A gull: two arcs meeting at a point.
const gull = (x: number, y: number): Point[] => [[x - 14, y], [x - 7, y - 7], [x, y], [x + 7, y - 7], [x + 14, y]];
// A ripple on the water.
const ripple = (x: number, y: number): Point[] => [[x - 26, y], [x - 10, y - 6], [x + 10, y - 6], [x + 26, y]];

const SEA: Point[] = [[-10, 700], [910, 700], [910, 1210], [-10, 1210]];
const CLIFF: Point[] = [[540, 1210], [548, 1040], [530, 930], [552, 840], [575, 770], [600, 712], [640, 668], [690, 640], [760, 622], [830, 612], [910, 600], [910, 1210]];
const TOWER: Point[] = [[738, 330], [782, 330], [798, 628], [722, 628]];

export function lighthouse(file = "lighthouse.png"): UseStep[] {
  return [
    say("A lighthouse at dusk. First the sky: warm at the horizon, deep blue above."),
    color("#f4a261"),
    use("fill_canvas"),
    color("#1d2b53"),
    use("gradient", { from: [450, 0], to: [450, 640] }),
    color("#e76f51"),
    use("gradient", { from: [450, 700], to: [450, 470] }),

    say("The first stars, and the sun about to set."),
    brush("Starfield", 100),
    color("#fdf6e3"),
    stroke([[30, 60], [300, 95], [600, 50], [870, 85]]),
    stroke([[40, 175], [320, 205], [620, 160], [860, 195]]),
    brush("Airbrush", 300),
    use("opacity", { percent: 30 }),
    color("#ffd28a"),
    use("dab", { x: 250, y: 650 }),
    color("#ffe8a3"),
    fill(circle(250, 655, 55)),

    say("The sea, lighter at the horizon, with the sun's reflection."),
    color("#264653"),
    fill(SEA, false),
    mask(SEA, false),
    color("#2a9d8f"),
    use("gradient", { from: [450, 700], to: [450, 900] }),
    use("clear_mask"),
    brush("Bristles-2", 12),
    color("#ffd28a"),
    stroke([[200, 712], [300, 712]]),
    stroke([[210, 735], [290, 735]]),
    stroke([[220, 760], [280, 760]]),
    stroke([[228, 790], [272, 790]]),
    stroke([[236, 825], [264, 825]]),

    say("A rocky cliff on the right, lit from the sunset on its left face, grass along the top."),
    color("#2b2d42"),
    fill(CLIFF, false),
    mask(CLIFF, false),
    brush("Airbrush", 180),
    use("opacity", { percent: 30 }),
    color("#4a4e69"),
    stroke([[600, 720], [570, 820], [560, 940], [560, 1100]]),
    color("#14151f"),
    stroke([[860, 700], [880, 900], [890, 1150]]),
    use("clear_mask"),
    brush("Stamp Grass", 50),
    color("#3a5a40"),
    stroke([[600, 712], [640, 670], [700, 642], [770, 624], [840, 612], [905, 602]]),

    say("The lighthouse: a white tower with red bands."),
    color("#f1faee"),
    fill(TOWER, false),
    color("#e63946"),
    fill([[734, 400], [786, 400], [788, 440], [732, 440]], false),
    fill([[729, 500], [791, 500], [793, 540], [727, 540]], false),
    mask(TOWER, false),
    brush("Airbrush", 60),
    use("opacity", { percent: 35 }),
    color("#8d8fa3"),
    stroke([[792, 332], [800, 626]]),
    use("clear_mask"),
    color("#1d3557"),
    fill([[728, 318], [792, 318], [792, 332], [728, 332]], false),
    fill([[736, 272], [760, 240], [784, 272]], false),
    fill([[755, 470], [765, 470], [765, 490], [755, 490]], false),
    fill([[752, 594], [768, 594], [768, 628], [752, 628]], false),
    color("#ffd166"),
    fill([[742, 272], [778, 272], [778, 318], [742, 318]], false),
    brush("Fineliner", 3),
    color("#1d3557"),
    stroke([[760, 272], [760, 318]]),

    say("The lamp is lit: a glow, and two beams across the dusk."),
    brush("Airbrush", 240),
    use("opacity", { percent: 35 }),
    color("#fff3b0"),
    use("dab", { x: 760, y: 294 }),
    mask([[760, 286], [180, 190], [180, 390]], false),
    use("size", { px: 220 }),
    use("opacity", { percent: 22 }),
    stroke([[740, 292], [480, 266], [200, 292]]),
    mask([[778, 286], [906, 248], [906, 334]], false),
    stroke([[790, 292], [904, 292]]),
    use("clear_mask"),

    say("Ripples on the water, foam at the foot of the cliff, three gulls."),
    brush("Fineliner", 3),
    color("#a8dadc"),
    ...[[80, 760], [330, 790], [120, 860], [400, 880], [60, 960], [260, 1000], [450, 1040], [150, 1100], [350, 1150], [470, 960], [40, 1180], [300, 1080]].map(([x, y]) => stroke(ripple(x, y))),
    brush("Airbrush", 40),
    use("opacity", { percent: 45 }),
    color("#f1faee"),
    stroke([[556, 1200], [544, 1040], [528, 930], [550, 840], [573, 770], [598, 714]]),
    brush("Fineliner", 3),
    color("#1d3557"),
    stroke(gull(380, 420)),
    stroke(gull(430, 380)),
    stroke(gull(330, 362)),

    say("Last, darker corners to hold the eye in the picture."),
    brush("Airbrush", 260),
    use("opacity", { percent: 22 }),
    color("#10172a"),
    stroke([[-6, 300], [-6, -4], [300, -4]]),
    stroke([[600, -4], [906, -4], [906, 300]]),
    stroke([[-6, 900], [-6, 1204], [300, 1204]]),
    stroke([[600, 1204], [906, 1204], [906, 900]]),

    say("Done: a lighthouse at dusk, painted from the krita-painting skill."),
    use("export", { file }),
  ];
}
