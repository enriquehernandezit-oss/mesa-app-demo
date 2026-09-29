#!/usr/bin/env python3
"""Mesa — the two rocks-glass options (19 Ice, 22 Smoke) redrawn realistically: a heavy-bottomed glass with a thick
rim, shaded drink with a real surface, ice that reads as ice, a glass cloche and soft drifting smoke. Rebuilds the
Cocktails canvas with these two in place of the flat ones."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build15 as R6  # noqa: E402
from build13 import MOVE, R3, st, svg  # noqa: E402

R3.AMBIENT += """
@keyframes drift { 0% { transform: translate(-8px, 5px) rotate(-3deg); } 100% { transform: translate(8px, -5px) rotate(3deg); } }
.drift { animation: drift 7s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
@keyframes plume { 0% { transform: translateY(10px); opacity: 0.4; } 50% { opacity: 1; } 100% { transform: translateY(-14px); opacity: 0.4; } }
.plume { animation: plume 5s ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) { .drift, .plume { animation: none !important; } }
"""

SURF0 = 148
OUTER = "M 76 96 L 82 252 A 68 15 0 0 0 218 252 L 224 96 A 74 12 0 0 0 76 96 Z"
CAVITY = "M 80.5 97 L 86.5 226 A 63.5 13 0 0 0 213.5 226 L 219.5 97 A 69.5 11.3 0 0 0 80.5 97 Z"
BASE = "M 86.5 226 A 63.5 13 0 0 0 213.5 226 L 218 252 A 68 15 0 0 1 82 252 Z"
SLIVERS = [(114, 121, 26, 9, 4.5, -6, False), (158, 124, 22, 8, 4, 8, False)]
CUBES = [(94, 126, 40, 40, 8, -10, False), (136, 118, 40, 40, 8, 8, False), (170, 138, 36, 36, 7, -4, False)]
BIG = [(106, 116, 88, 88, 7, 4, True)]


def grad(gid, stops, x2=0, y2=1):
    s = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return f'<linearGradient id="{gid}" x1="0" y1="0" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def cube(x, y, w, h, r, rot, clear, surface, uid, night):
    cx, cy = x + w / 2, y + h / 2
    top_left = f"M {x} {y + h - r} L {x} {y + r} Q {x} {y} {x + r} {y} L {x + w - r} {y}"
    bot_right = f"M {x + w} {y + r} L {x + w} {y + h - r} Q {x + w} {y + h} {x + w - r} {y + h} L {x + r} {y + h}"

    def shape(fill, edge, hi, lo):
        core = ("" if clear else f'<ellipse cx="{cx}" cy="{cy}" rx="{w * 0.25:.1f}" ry="{h * 0.2:.1f}" '
                f'style="fill: #ffffff; opacity: {0.16 if night else 0.3}; filter: url(#cor{uid});"/>')
        glint = (f'<path d="M {x + 10} {y + 20} L {x + 19} {y + 11} M {x + 10} {y + 31} L {x + 30} {y + 11}" '
                 'style="stroke: #ffffff; stroke-width: 1.6; stroke-linecap: round; opacity: 0.85;"/>' if clear else "")
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" style="fill: {fill}; stroke: {edge}; stroke-width: 1;"/>{core}'
                f'<rect x="{x + 4.5}" y="{y + 4.5}" width="{w - 9}" height="{h - 9}" rx="{max(r - 3, 2)}" style="fill: none; stroke: #ffffff; stroke-opacity: 0.3;"/>'
                f'<path d="{top_left}" style="fill: none; stroke: {hi}; stroke-width: 1.6; stroke-linecap: round;"/>'
                f'<path d="{bot_right}" style="fill: none; stroke: {lo}; stroke-width: 1.1; stroke-linecap: round;"/>{glint}')

    turn = f'transform="rotate({rot} {cx} {cy})"'
    above = (shape("rgba(255,255,255,0.14)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0.9)", "rgba(255,255,255,0.35)") if night
             else shape("rgba(236,242,244,0.75)", "rgba(60,48,44,0.38)", "rgba(255,255,255,1)", "rgba(60,48,44,0.3)"))
    below = shape("rgba(20,0,6,0.2)", "rgba(255,235,238,0.35)", "rgba(255,244,246,0.85)", "rgba(255,235,238,0.3)")
    return (f'<g clip-path="url(#ab{uid}{surface})"><g {turn}>{above}</g></g>'
            f'<g clip-path="url(#bw{uid}{surface})"><g {turn}>{below}</g></g>')


def flower(uid, cx, cy, k=1.0):
    """A dried hibiscus flower lying flat, seen from slightly above."""
    petals = "".join(f'<ellipse cx="0" cy="-13" rx="11" ry="14" transform="rotate({a})" style="fill: url(#pet{uid}); stroke: #33060f; stroke-width: 0.8;"/>'
                     f'<path d="M 0 -3 L 0 -22" transform="rotate({a})" style="stroke: #33060f; stroke-width: 0.9; opacity: 0.6;"/>' for a in range(18, 378, 72))
    return (f'<g transform="translate({cx} {cy}) scale({k} {k * 0.5})">{petals}<circle r="5.5" style="fill: #22040a;"/>'
            '<circle cx="-1.5" cy="-2" r="1.4" style="fill: #efe3cf;"/><circle cx="2" cy="-1" r="1.1" style="fill: #efe3cf;"/>'
            '<circle cx="0" cy="2" r="1" style="fill: #efe3cf;"/></g>')


def rose(cx, cy, k=1.0):
    """A dried rose bud resting on the foam."""
    return (f'<g transform="translate({cx} {cy}) scale({k} {k * 0.62})"><circle r="12.5" style="fill: #6a1424;"/>'
            '<path d="M -12 2 C -12 -9 10 -12 12 -2 M -10 7 C -4 12 8 11 11 4" style="fill: none; stroke: #3a0812; stroke-width: 1.4; stroke-linecap: round;"/>'
            '<path d="M -2 -1 C -2 -5 5 -5 5 0 C 5 6 -6 7 -7 0 C -8 -8 4 -11 9 -5" style="fill: none; stroke: #33060f; stroke-width: 1.6; stroke-linecap: round;"/>'
            '<path d="M -8 -6 C -4 -10 2 -10 5 -9" style="fill: none; stroke: #b04a5a; stroke-width: 1; opacity: 0.55; stroke-linecap: round;"/></g>')


def sugar_rim(night):
    """Sugar crystals crusted along the outside of the rim."""
    import math
    import random
    rnd = random.Random(5)
    base = "#efe8dd" if night else "#fbf8f2"
    dots = ""
    for _ in range(90):
        t = rnd.uniform(0.02, 0.98) * math.pi
        x, y = 150 + 74 * math.cos(t), 100 + 12 * math.sin(t) + rnd.uniform(-4, 4)
        dots += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rnd.uniform(0.6, 1.5):.1f}" style="fill: {rnd.choice(["#ffffff", "#d9d0c4", "#ffffff"])};"/>'
    edge = "" if night else '<path d="M 76 105 A 74 12 0 0 0 224 105" style="fill: none; stroke: rgba(60,48,44,0.18); stroke-width: 1;"/>'
    return (f'<path d="M 77 98 A 73 11.5 0 0 1 223 98" style="fill: none; stroke: {base}; stroke-width: 5; opacity: 0.85;"/>'
            f'<path d="M 76 100 A 74 12 0 0 0 224 100" style="fill: none; stroke: {base}; stroke-width: 10; stroke-linecap: round;"/>{edge}{dots}')


def rocks(uid, p, s, kf, night, surfaces, murky, ice_sets, shadow=True, foam=False, sugar=False, garnish=None):
    """A heavy-bottomed rocks glass, full size in the 300px box (bottom at y=267)."""
    defs = (f'<clipPath id="cav{uid}"><path d="{CAVITY}"/></clipPath><clipPath id="bas{uid}"><path d="{BASE}"/></clipPath>'
            + grad(f"liq{uid}", [(0, "#7c1a2c", 1), (0.5, "#5a1020", 1), (1, "#2a050c", 1)])
            + grad(f"mur{uid}", [(0, "#5f2e30", 1), (1, "#261012", 1)])
            + grad(f"cyl{uid}", [(0, "#000", 0.55), (0.14, "#000", 0.12), (0.3, "#fff", 0.06), (0.55, "#000", 0), (0.86, "#000", 0.2), (1, "#000", 0.6)], 1, 0)
            + grad(f"srf{uid}", [(0, "#3e0914", 1), (0.62, "#6a1526", 1), (1, "#8a2034", 1)])
            + grad(f"spc{uid}", [(0, "#fff", 0), (0.12, "#fff", 0.95 if not night else 0.8), (0.7, "#fff", 0.55), (1, "#fff", 0)])
            + grad(f"bse{uid}", [(0, "#fff", 0.55 if not night else 0.16), (0.55, "#fff", 0.2 if not night else 0.05), (1, "#fff", 0.4 if not night else 0.12)])
            + grad(f"ref{uid}", [(0, "#7a1a29", 0.55), (1, "#7a1a29", 0)])
            + grad(f"fom{uid}", [(0, "#f4ecdf", 1), (1, "#d9c8b1", 1)])
            + f'<radialGradient id="pet{uid}"><stop offset="0" stop-color="#3a0812"/><stop offset="1" stop-color="#8e2035"/></radialGradient>'
            + f'<radialGradient id="sha{uid}"><stop offset="0" stop-color="#3c2618" stop-opacity="{0 if night else 0.3}"/>'
              f'<stop offset="1" stop-color="#3c2618" stop-opacity="0"/></radialGradient>'
            f'<filter id="blr{uid}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>'
            f'<filter id="cor{uid}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.5"/></filter>')
    for v in sorted({c for c in surfaces}):
        defs += (f'<clipPath id="ab{uid}{v + 4}"><rect x="-100" y="-100" width="500" height="{v + 104}"/></clipPath>'
                 f'<clipPath id="bw{uid}{v + 4}"><rect x="-100" y="{v + 4}" width="500" height="400"/></clipPath>')
    edge = "rgba(244,237,226,0.38)" if night else "rgba(40,28,24,0.34)"
    edge2 = "rgba(244,237,226,0.14)" if night else "rgba(40,28,24,0.14)"
    body = "rgba(255,255,255,0.05)" if night else "rgba(255,255,255,0.3)"

    level = st(f"{p}lq", {"transform": [f"translateY({v - SURF0}px)" for v in surfaces]}, s, kf, MOVE)
    murk = st(f"{p}mk", {"opacity": murky}, s, kf)
    liquid = (f'<g clip-path="url(#cav{uid})"><g style="{level}">'
              f'<rect x="82" y="{SURF0}" width="136" height="124" fill="url(#liq{uid})"/>'
              f'<rect x="82" y="{SURF0}" width="136" height="124" fill="url(#mur{uid})" style="{murk}"/>'
              f'<rect x="82" y="{SURF0}" width="136" height="124" fill="url(#cyl{uid})"/>'
              + (f'<path d="M 82.9 {SURF0} L 82.9 {SURF0 + 16} A 67.1 13 0 0 0 217.1 {SURF0 + 16} L 217.1 {SURF0} Z" fill="url(#fom{uid})"/>'
                 f'<path d="M 82.9 {SURF0 + 16} A 67.1 13 0 0 0 217.1 {SURF0 + 16}" style="fill: none; stroke: #4a0c18; stroke-opacity: 0.35; stroke-width: 1.4;"/>'
                 f'<ellipse cx="150" cy="{SURF0}" rx="67.1" ry="13" style="fill: #f7f0e6;"/>'
                 + "".join(f'<ellipse cx="{x}" cy="{SURF0 + dy}" rx="3.4" ry="1.5" style="fill: #7a1a29;"/>' for x, dy in [(124, 3), (140, 6), (178, 5)])
                 if foam else f'<ellipse cx="150" cy="{SURF0}" rx="67.1" ry="13" fill="url(#srf{uid})"/>')
              + f'<path d="M 82.9 {SURF0} A 67.1 13 0 0 0 217.1 {SURF0}" style="fill: none; stroke: #ffffff; stroke-opacity: 0.42; stroke-width: 1.2;"/></g>'
              f'<ellipse cx="150" cy="222" rx="44" ry="8" style="fill: #8e1d31; opacity: 0.35; filter: url(#blr{uid});"/></g>')
    ice = ""
    if all(ice_sets[0] is x for x in ice_sets):
        ice = "".join(cube(*c, surfaces[0] + 4, uid, night) for c in ice_sets[0])
    else:
        for j, cubes in enumerate(ice_sets):
            show = st(f"{p}ic{j}", {"opacity": ["1" if k == j else "0" for k in range(3)]}, s, kf)
            ice += f'<g style="{show}">' + "".join(cube(*c, surfaces[j] + 4, uid, night) for c in cubes) + "</g>"
    if garnish:
        if all(garnish[0] is g for g in garnish):
            ice += garnish[0] or ""
        else:
            for j, g in enumerate(garnish):
                if g:
                    ice += f'<g style="{st(f"{p}gn{j}", {"opacity": ["1" if k == j else "0" for k in range(3)]}, s, kf)}">{g}</g>'
    base = (f'<path d="{BASE}" fill="url(#bse{uid})"/>'
            f'<g clip-path="url(#bas{uid})"><rect x="80" y="224" width="140" height="18" fill="url(#ref{uid})"/></g>'
            '<path d="M 95.5 249.8 A 58 11 0 0 0 204.5 249.8" style="fill: none; stroke: #ffffff; stroke-opacity: 0.8; stroke-width: 1.6; stroke-linecap: round;"/>'
            '<path d="M 104 240 A 48 8 0 0 0 196 240" style="fill: none; stroke: #ffffff; stroke-opacity: 0.35; stroke-width: 1.2; stroke-linecap: round;"/>')
    walls = (f'<path d="{OUTER}" style="fill: none; stroke: {edge}; stroke-width: 1.2;"/>'
             f'<path d="M 80.5 97 L 86.5 226 M 219.5 97 L 213.5 226" style="fill: none; stroke: {edge2}; stroke-width: 1;"/>'
             f'<path d="M 84.5 106 L 88 222 L 93 222 L 89.5 106 Z" fill="url(#spc{uid})"/>'
             f'<path d="M 96 108 L 99 220 L 112 220 L 109 108 Z" style="fill: #ffffff; opacity: {0.06 if night else 0.13};"/>'
             f'<path d="M 210 108 L 207 220 L 209.4 220 L 212.4 108 Z" fill="url(#spc{uid})" style="opacity: 0.55;"/>')
    rim = (f'<path d="M 80.5 97 A 69.5 11.3 0 0 1 219.5 97" style="fill: none; stroke: {edge2}; stroke-width: 1;"/>'
           + ("" if night else '<path d="M 76 97.5 A 74 12 0 0 0 224 97.5" style="fill: none; stroke: rgba(40,28,24,0.3); stroke-width: 1;"/>')
           + '<path d="M 76 96 A 74 12 0 0 0 224 96" style="fill: none; stroke: #ffffff; stroke-opacity: 0.92; stroke-width: 1.8;"/>')
    back_rim = f'<path d="M 76 96 A 74 12 0 0 1 224 96" style="fill: none; stroke: {edge}; stroke-width: 1.2;"/>'
    under = ""
    if shadow:
        under = (f'<ellipse cx="150" cy="266" rx="102" ry="14" fill="url(#sha{uid})"/>'
                 f'<ellipse cx="184" cy="268" rx="58" ry="8" style="fill: #7a1a29; opacity: {0.3 if night else 0.22}; filter: url(#blr{uid});"/>')
    return (under + f'<path d="{OUTER}" style="fill: {body};"/>' + back_rim + liquid + ice + base + walls + rim
            + (sugar_rim(night) if sugar else "")), defs


# ================================================================ 19 · ICE, realistic

def ice_real_graphic(s, kf, p):
    uid, night = f"{p}{s}", p.endswith("N")
    glass, defs = rocks(uid, p, s, kf, night, [128, SURF0, SURF0], ["1", "0", "0"], [SLIVERS, CUBES, BIG],
                        sugar=True, garnish=[None, None, flower(uid, 152, 132, 1.4)])
    return svg(glass, defs)


# ================================================================ 22 · SMOKE, realistic (a cloche on a charred board)

NONE, ROSE = [], rose(160, 146, 1.1)
CLOCHE = "M 56 256 L 62 124 C 62 48 238 48 238 124 L 244 256 A 94 13 0 0 1 56 256 Z"
INSIDE = [(150, 118, 70, 46), (112, 170, 42, 40), (190, 168, 44, 40), (150, 206, 76, 22), (104, 222, 26, 24), (198, 222, 26, 24)]
PLUME = [(150, 152, 20, 30), (146, 114, 26, 32), (155, 76, 32, 30), (144, 42, 38, 28)]


def smoke_real_graphic(s, kf, p):
    uid, night = f"{p}{s}", p.endswith("N")
    glass, gdefs = rocks(uid + "g", p + "g", s, kf, night, [SURF0] * 3, ["0", "0", "0"], [NONE] * 3, shadow=False, foam=True,
                         garnish=[ROSE] * 3)
    smoke = "rgba(236,228,218,0.55)" if night else "rgba(120,106,98,0.5)"
    edge = "rgba(244,237,226,0.34)" if night else "rgba(40,28,24,0.28)"
    defs = (gdefs + f'<clipPath id="dm{uid}"><path d="{CLOCHE}"/></clipPath>'
            + grad(f"wd{uid}", [(0, "#3a2a22" if not night else "#2e221d", 1), (1, "#1c130f", 1)])
            + grad(f"cl{uid}", [(0, "#fff", 0), (0.1, "#fff", 0.9 if not night else 0.7), (0.75, "#fff", 0.45), (1, "#fff", 0)])
            + f'<filter id="sm{uid}" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">'
              '<feTurbulence type="fractalNoise" baseFrequency="0.016 0.04" numOctaves="3" seed="11" result="n"/>'
              '<feDisplacementMap in="SourceGraphic" in2="n" scale="44" xChannelSelector="R" yChannelSelector="G" result="d"/>'
              '<feGaussianBlur in="d" stdDeviation="4.5"/></filter>')
    board = (f'<path d="M 26 258 A 124 17 0 0 0 274 258 L 274 269 A 124 17 0 0 1 26 269 Z" style="fill: #140d0a;"/>'
             f'<ellipse cx="150" cy="258" rx="124" ry="17" fill="url(#wd{uid})"/>'
             '<path d="M 60 256 A 96 11 0 0 1 240 256 M 84 262 A 70 7 0 0 0 216 262" style="fill: none; stroke: #ffffff; stroke-opacity: 0.05; stroke-width: 1;"/>'
             f'<path d="M 26 258 A 124 17 0 0 1 274 258" style="fill: none; stroke: #ffffff; stroke-opacity: {0.16 if night else 0.1}; stroke-width: 1.2;"/>')
    inside = st(f"{p}si", {"opacity": ["0", "1", "0"]}, s, kf)
    rising = st(f"{p}sr", {"opacity": ["0", "0", "1"]}, s, kf)
    puffs = "".join(f'<ellipse cx="{x}" cy="{y}" rx="{a}" ry="{b}"/>' for x, y, a, b in INSIDE)
    plume = "".join(f'<ellipse cx="{x}" cy="{y}" rx="{a}" ry="{b}"/>' for x, y, a, b in PLUME)
    smoke_in = (f'<g style="{inside}"><g clip-path="url(#dm{uid})"><g filter="url(#sm{uid})" style="fill: {smoke};">'
                f'<g class="drift">{puffs}</g></g></g></g>')
    smoke_up = (f'<g style="{rising}"><g filter="url(#sm{uid})" style="fill: {smoke};"><g class="plume">{plume}</g></g></g>')
    lid = st(f"{p}lid", {"transform": ["translate(0px, 0px) rotate(0deg)", "translate(0px, 0px) rotate(0deg)", "translate(44px, -30px) rotate(18deg)"]},
             s, kf, MOVE + " transform-origin: 244px 256px;")
    cloche = (f'<g style="{lid}"><path d="{CLOCHE}" style="fill: #ffffff; opacity: {0.04 if night else 0.16};"/>'
              f'<path d="{CLOCHE}" style="fill: none; stroke: {edge}; stroke-width: 1.2;"/>'
              f'<path d="M 67 132 L 63 246 L 70 246 L 74 132 Z" fill="url(#cl{uid})"/>'
              f'<path d="M 232 132 L 235 246 L 237.5 246 L 234.5 132 Z" fill="url(#cl{uid})" style="opacity: 0.5;"/>'
              '<path d="M 80 118 C 84 86 110 68 140 63" style="fill: none; stroke: #ffffff; stroke-opacity: 0.85; stroke-width: 3; stroke-linecap: round;"/>'
              '<path d="M 56 256 A 94 13 0 0 0 244 256" style="fill: none; stroke: #ffffff; stroke-opacity: 0.75; stroke-width: 1.6;"/>'
              f'<path d="M 150 67 L 150 58" style="stroke: {edge}; stroke-width: 3; stroke-linecap: round;"/>'
              f'<circle cx="150" cy="50" r="9" style="fill: #ffffff; fill-opacity: {0.08 if night else 0.35}; stroke: {edge}; stroke-width: 1.2;"/>'
              '<path d="M 145 46 A 5 5 0 0 1 151 43" style="fill: none; stroke: #ffffff; stroke-opacity: 0.9; stroke-width: 1.6; stroke-linecap: round;"/></g>')
    small = f'<g transform="translate(57 90.5) scale(0.62)">{glass}</g>'
    return svg(board + '<ellipse cx="150" cy="258" rx="58" ry="7" style="fill: #000; opacity: 0.35; filter: url(#blr' + uid + 'g);"/>'
               + small + smoke_in + smoke_up + cloche, defs)


R6.NEW[2].update(graphic=ice_real_graphic,
                 short="A hibiscus margarita with a sugared rim: watered down, three cloudy cubes, or one clear cube with a flower on top.",
                 sub="A hibiscus margarita on the rocks with a sugared rim: watered down with the last slivers of ice, three cloudy cubes, "
                     "or one big crystal-clear cube with a dried hibiscus flower resting on it.")
R6.NEW[5].update(graphic=smoke_real_graphic,
                 short="A smoked rose-and-berry sour under a glass cloche: no smoke, the dome full of it, the dome lifted.",
                 sub="A rose-and-berry sour with a cream foam top, bitters and a dried rose bud, under a glass cloche: nothing happening, "
                     "the dome filled with smoke, or the dome lifted and the smoke pouring out.")
R6.NEW[1].update(sub="A Cosmopolitan in a coupe and its garnish: the peel left limp on the table, a plain strip over the rim, or a long "
                     "spiral twist in burgundy that draws itself in.")

if __name__ == "__main__":
    R6.main()
