#!/usr/bin/env python3
"""Mesa — "How was it?", round six: six from the bar (Bubbles, Twist, Ice, Last sip, Tower, Smoke) in the same flat,
thin-line family, with the night accent the app's own burgundy. Plus the two night-out ones from before (Wave, Cheers).
Numbered 17-22, continuing the earlier rounds."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mesa_ui import SERIF  # noqa: E402
import build13 as R4  # noqa: E402
import build14 as R5  # noqa: E402  (pen strokes; importing it also adds the steam's drift to the pages)
from build13 import MOVE, R3, st, svg  # noqa: E402

OUT = os.path.join(HERE, "bar", "project")
R3.GVARS += "\n.Day, .Night { --g-bub: #f4ede2; }\n"
R3.AMBIENT += """
@keyframes fizz { 0% { transform: translateY(0px); opacity: 0; } 12% { opacity: 0.9; } 82% { opacity: 0.9; } 100% { transform: translateY(var(--rise)); opacity: 0; } }
.fizz { animation: fizz 3s linear infinite; transform-box: view-box; }
@keyframes twinkle { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.8; } }
.twinkle { animation: twinkle 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .fizz, .twinkle { animation: none !important; } }
"""
LINE = "fill: none; stroke: var(--fg); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;"


# ================================================================ 17 · BUBBLES (gone flat → a slow stream → lively)

FLUTE = "M 124 34 C 121 86 126 150 144 196 L 156 196 C 174 150 179 86 176 34 Z"
FLUTE_BASE = "M 150 196 L 150 262 M 122 266 C 138 261 162 261 178 266"
SURFACE = 58
FEW = [(150, 2.4, 0), (149, 2, 0.85), (151, 2.6, 1.7), (150, 1.8, 2.55)]
MANY = [(146, 188, 2.2, 2.2, 0.3), (146, 188, 1.8, 2.2, 1.4), (154, 186, 2.0, 2.4, 0.7), (154, 186, 2.4, 2.4, 1.9), (139, 150, 1.6, 2.0, 0.2),
        (139, 150, 2.0, 2.0, 1.1), (161, 140, 1.8, 2.1, 0.5), (161, 140, 1.5, 2.1, 1.5), (144, 170, 1.7, 2.3, 1.0), (157, 162, 2.1, 2.2, 0.1)]
POPS = [(142, 24, 1.6, 0), (156, 18, 1.4, 0.6), (149, 10, 1.9, 1.1), (163, 28, 1.3, 0.3)]


def bubble(x, y0, r, dur, delay):
    return (f'<circle cx="{x}" cy="{y0}" r="{r}" class="fizz" style="fill: var(--g-bub); --rise: -{y0 - SURFACE - 4}px; '
            f'animation-duration: {dur}s; animation-delay: -{delay}s;"/>')


def bubbles_graphic(s, kf, p):
    cid = f"fl{p}{s}"
    drink = st(f"{p}dr", {"fill": ["var(--muted)", "var(--g-acc)", "var(--g-acc)"]}, s, kf)
    few = "".join(bubble(x, 190, r, 3.4, d) for x, r, d in FEW)
    many = "".join(bubble(x, y0, r, dur, d) for x, y0, r, dur, d in MANY)
    pops = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" class="twinkle" style="fill: var(--fg); animation-delay: -{d}s;"/>' for x, y, r, d in POPS)
    some, lots = st(f"{p}bf", {"opacity": ["0", "1", "1"]}, s, kf), st(f"{p}bm", {"opacity": ["0", "0", "1"]}, s, kf)
    return svg(f'<g clip-path="url(#{cid})"><rect x="110" y="{SURFACE}" width="80" height="150" style="{drink}"/>'
               f'<g style="{some}">{few}</g><g style="{lots}">{many}</g></g><g style="{lots}">{pops}</g>'
               f'<path d="{FLUTE}" style="{LINE}"/><path d="{FLUTE_BASE}" style="{LINE}"/>',
               f'<clipPath id="{cid}"><path d="{FLUTE}"/></clipPath>')


# ================================================================ the coupe (Twist, Last sip)

COUPE = "M 78 118 C 80 158 112 176 150 176 C 188 176 220 158 222 118 Z"
COUPE_BASE = "M 150 176 L 150 250 M 116 254 C 134 250 166 250 184 254"


def coupe(cid, drink_style="", after=""):
    return (f'<g clip-path="url(#{cid})"><rect x="70" y="122" width="160" height="68" style="fill: var(--g-acc); {drink_style}"/></g>{after}'
            f'<path d="{COUPE}" style="{LINE}"/><path d="{COUPE_BASE}" style="{LINE}"/>'), f'<clipPath id="{cid}"><path d="{COUPE}"/></clipPath>'


# ================================================================ 18 · TWIST (a peel left behind → over the rim → a spiral twist)

TWISTS = [
    ("var(--muted)", "M 194 256 C 212 251 236 258 262 253"),
    ("var(--fg)", "M 198 112 C 216 106 230 114 232 128 C 234 142 228 152 226 164"),
    ("var(--g-acc)", "M 200 112 C 222 104 240 118 232 132 C 222 148 206 138 216 126 C 230 112 252 128 242 146 C 232 164 214 158 222 144 "
                     "C 232 130 256 146 246 166 C 238 182 222 180 226 168"),
]


def twist_graphic(s, kf, p):
    glass, defs = coupe(f"tw{p}{s}")
    peels = "".join(R5.pen(f"{p}pe{j}", d, j, s, kf, color, 7, 700) for j, (color, d) in enumerate(TWISTS))
    return svg(glass + peels, defs)


# ================================================================ 19 · ICE (watered down → a few cubes → one big clear cube)

ROCKS = "M 84 108 L 216 108 L 208 254 C 207.5 259 203 262 198 262 L 102 262 C 97 262 92.5 259 92 254 Z"
ROCKS_INSIDE = "M 86 110 L 214 110 L 207 240 L 93 240 Z"
ICE = [
    [(112, 118, 28, 12, 6, -4), (158, 121, 22, 10, 5, 6)],  # the last melted slivers
    [(100, 124, 38, 38, 5, -8), (146, 118, 38, 38, 5, 7), (174, 136, 32, 32, 5, -3)],  # ordinary cubes
    [(104, 128, 92, 92, 5, 3)],  # one big clear cube
]


def ice_graphic(s, kf, p):
    cid = f"rk{p}{s}"
    drink = st(f"{p}dk", {"transform": ["translateY(-16px)", "translateY(0px)", "translateY(0px)"],
                          "fill": ["var(--muted)", "var(--g-acc)", "var(--g-acc)"]}, s, kf, MOVE)
    ice = ""
    for j, cubes in enumerate(ICE):
        show = st(f"{p}ic{j}", {"opacity": ["1" if k == j else "0" for k in range(3)], "transform": ["scale(1)" if k == j else "scale(0.9)" for k in range(3)]},
                  s, kf, "transform-box: fill-box; transform-origin: center;")
        rects = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" transform="rotate({a} {x + w / 2} {y + h / 2})"/>'
                        for x, y, w, h, r, a in cubes)
        glint = '<path d="M 118 152 L 118 142 L 130 142" style="stroke-width: 2.4;"/>' if j == 2 else ""
        ice += f'<g style="fill: none; stroke: var(--fg); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; {show}">{rects}{glint}</g>'
    return svg(f'<g clip-path="url(#{cid})"><rect x="80" y="140" width="140" height="130" style="{drink}"/></g>{ice}'
               f'<path d="{ROCKS}" style="{LINE}"/><path d="M 94 240 L 206 240" style="{LINE}"/>',
               f'<clipPath id="{cid}"><path d="{ROCKS_INSIDE}"/></clipPath>')


# ================================================================ 20 · LAST SIP (barely touched → half → drained, the cherry left)

def last_sip_graphic(s, kf, p):
    level = st(f"{p}lv", {"transform": ["translateY(0px)", "translateY(26px)", "translateY(62px)"]}, s, kf, MOVE)
    cherry = st(f"{p}cy", {"opacity": ["0", "0", "1"], "transform": ["translateY(-8px)", "translateY(-8px)", "translateY(0px)"]}, s, kf, MOVE)
    left = (f'<g style="{cherry}"><circle cx="150" cy="167" r="8.5" style="fill: var(--g-acc);"/>'
            f'<path d="M 151 159 C 153 147 162 139 174 137" style="{LINE} stroke-width: 1.8;"/></g>')
    glass, defs = coupe(f"ls{p}{s}", level, left)
    return svg(glass, defs)


# ================================================================ 21 · TOWER (one lonely coupe → three → a ten-glass tower)

MINI = "M -25 0 C -24 13 -13 19 0 19 C 13 19 24 13 25 0 Z"
MINI_BASE = "M 0 19 L 0 33 M -12 36 C -5 34 5 34 12 36"
TK = 1.35  # the little coupes, enlarged; rows sit 49px apart so each glass rests on the two rims below
TOWER = [((150, 114, 114), 214, "111"), ((186, 186, 186), 214, "011"), ((150, 150, 150), 165, "011"),
         ((42,) * 3, 214, "001"), ((258,) * 3, 214, "001"), ((78,) * 3, 165, "001"), ((222,) * 3, 165, "001"),
         ((114,) * 3, 116, "001"), ((186,) * 3, 116, "001"), ((150,) * 3, 67, "001")]


def tower_graphic(s, kf, p):
    out = defs = ""
    for k, (xs, y, mask) in enumerate(TOWER):
        on = [c == "1" for c in mask]
        at = st(f"{p}t{k}", {"transform": [f"translate({xs[i]}px, {y if on[i] else y - 14}px) scale({TK})" for i in range(3)],
                             "opacity": ["1" if v else "0" for v in on]}, s, kf, MOVE + " transform-origin: 0 0;")
        cid = f"to{k}{p}{s}"
        defs += f'<clipPath id="{cid}"><path d="{MINI}"/></clipPath>'
        out += (f'<g style="{at}"><g clip-path="url(#{cid})"><rect x="-26" y="4" width="52" height="18" style="fill: var(--g-acc);"/></g>'
                f'<path d="{MINI}" style="{LINE} stroke-width: {2 / TK:.2f};"/><path d="{MINI_BASE}" style="{LINE} stroke-width: {2 / TK:.2f};"/></g>')
    return svg(out, defs)


# ================================================================ 22 · SMOKE (dome down → smoke gathering → the dome swung open)

DOME = "M 90 262 L 90 160 C 90 104 210 104 210 160 L 210 262"
SMALL_ROCKS = "M 118 196 L 182 196 L 178 256 C 178 259 176 261 173 261 L 127 261 C 124 261 122 259 122 256 Z"
INSIDE_SMOKE = ["M 104 186 C 100 160 124 150 138 162 C 150 172 170 166 168 150 C 166 136 148 132 140 142",
                "M 196 184 C 202 158 180 146 166 156 C 154 164 136 160 136 146 C 136 132 154 126 162 136",
                "M 150 192 C 146 178 158 172 156 160"]
RISING_SMOKE = ["M 138 194 C 124 172 150 160 138 140 C 126 120 150 104 140 84 C 132 68 146 56 152 48",
                "M 162 194 C 176 174 152 160 164 140 C 176 120 154 104 164 86",
                "M 150 196 C 142 180 160 168 150 152"]


def smoke_graphic(s, kf, p):
    cid = f"sk{p}{s}"
    lid = st(f"{p}lid", {"transform": ["translate(0px, 0px) rotate(0deg)", "translate(0px, 0px) rotate(0deg)", "translate(30px, -34px) rotate(28deg)"]},
             s, kf, MOVE + " transform-origin: 210px 262px;")
    drink = st(f"{p}sd", {"fill": ["var(--muted)", "var(--g-acc)", "var(--g-acc)"]}, s, kf)

    def wisps(paths, j, alpha):
        show = st(f"{p}w{j}", {"opacity": ["1" if k == j else "0" for k in range(3)]}, s, kf)
        return "".join(f'<g style="{show}"><g class="waft" style="animation-delay: -{i * 0.9:.1f}s;">'
                       f'<path d="{d}" style="{LINE} stroke-width: 2; stroke-opacity: {alpha};"/></g></g>' for i, d in enumerate(paths))

    glass = (f'<g clip-path="url(#{cid})"><rect x="116" y="212" width="68" height="52" style="{drink}"/></g>'
             f'<rect x="132" y="214" width="34" height="34" rx="4" transform="rotate(4 149 231)" style="{LINE} stroke-width: 1.8;"/>'
             f'<path d="{SMALL_ROCKS}" style="{LINE}"/>')
    dome = (f'<g style="{lid}"><path d="{DOME}" style="{LINE}"/><path d="M 104 170 C 104 142 116 128 132 122" style="{LINE} stroke-opacity: 0.35;"/>'
            f'<path d="M 150 118 L 150 110" style="{LINE}"/><circle cx="150" cy="105" r="6" style="fill: var(--card); stroke: var(--fg); stroke-width: 2.2;"/></g>')
    return svg(wisps(INSIDE_SMOKE, 1, 0.4) + wisps(RISING_SMOKE, 2, 0.55) + glass
               + '<path d="M 62 264 L 238 264" style="fill: none; stroke: var(--fg); stroke-width: 2.4; stroke-linecap: round;"/>' + dome,
               f'<clipPath id="{cid}"><path d="{SMALL_ROCKS}"/></clipPath>')


# ================================================================ the canvas

NEW = [
    dict(pre="bu", name="Bubbles", file="F17-Bubbles.dc.html", graphic=bubbles_graphic,
         short="A flute that&rsquo;s gone flat, a slow stream of bubbles, or a lively one.",
         sub="A Kir Royale in a flute: gone flat, a thin slow stream of bubbles, or a lively one that fizzes over the rim &mdash; "
             "the bubbles never stop rising."),
    dict(pre="tw", name="Twist", file="F18-Twist.dc.html", graphic=twist_graphic,
         short="The garnish: a peel left on the table, a strip over the rim, or a spiral twist.",
         sub="A coupe and its garnish: the peel left limp on the table, a plain strip over the rim, or a long spiral twist in burgundy "
             "that draws itself in."),
    dict(pre="ic", name="Ice", file="F19-Ice.dc.html", graphic=ice_graphic,
         short="A rocks glass: watered down, a few ordinary cubes, or one big clear cube.",
         sub="A Negroni on the rocks: watered down with the last slivers of ice, a few ordinary cubes, or one big clear cube &mdash; "
             "the way a serious bar serves it."),
    dict(pre="ls", name="Last sip", file="F20-Last-sip.dc.html", graphic=last_sip_graphic,
         short="Barely touched, half gone, or drained with only the cherry left.",
         sub="Your cocktail from the side: barely touched, half gone, or drained to the last sip with only the cherry left at the bottom."),
    dict(pre="to", name="Tower", file="F21-Tower.dc.html", graphic=tower_graphic,
         short="One lonely coupe, a small stack of three, or a full champagne tower.",
         sub="Coupes stacked for a toast: one lonely glass, a small stack of three, or a full ten-glass champagne tower."),
    dict(pre="sk", name="Smoke", file="F22-Smoke.dc.html", graphic=smoke_graphic,
         short="A smoked cocktail under its dome: nothing yet, smoke gathering, the dome swung open.",
         sub="A smoked Old Fashioned under a glass dome: nothing happening, smoke gathering inside, or the dome swung open with the "
             "smoke curling up."),
]
BEFORE = [(4, R3.DIRS[3], "Thin sound bars: nearly silent, a gentle rhythm, or full energy."),
          (8, R4.NEW[3], "Two glasses stand apart, side by side, or lift and clink.")]
INK, CREAM, SOFT, ROSE = R4.INK, R4.CREAM, R4.SOFT, R4.ROSE


def main_page():
    w, h = 1680, 1250
    kf = {}
    big = ""
    for n, d in enumerate(NEW, 17):
        big += (f'<a href="{d["file"]}" class="tile" style="flex: 1; min-width: 0; border-radius: 30px; background: #171213; color: {CREAM}; '
                'padding: 20px 18px 22px; text-decoration: none; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;">'
                f'<span style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; color: {ROSE};">DIRECTION {n}</span>'
                f'<div class="offset" style="width: 197px; height: 426px; margin: 6px auto 10px;">{R4.mini(d, None, kf, 0.5)}</div>'
                f'<span style="font-family: {SERIF}; font-size: 30px; line-height: 1;">{d["name"]}</span>'
                f'<span style="font-size: 13.5px; line-height: 1.45; color: {SOFT};">{d["short"]}</span></a>')
    small = ""
    for n, d, short in BEFORE:
        small += (f'<a href="{d["file"]}" class="tile" style="flex: 1; min-width: 0; border-radius: 26px; background: #171213; color: {CREAM}; '
                  'padding: 16px 20px 16px 16px; text-decoration: none; display: flex; gap: 18px; align-items: center; box-sizing: border-box;">'
                  f'<div style="width: 118px; height: 256px; flex-shrink: 0;">{R4.mini(d, 2, kf, 0.3)}</div>'
                  '<div style="display: flex; flex-direction: column; gap: 8px; min-width: 0;">'
                  f'<span style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; color: {ROSE};">DIRECTION {n}</span>'
                  f'<span style="font-family: {SERIF}; font-size: 28px; line-height: 1;">{d["name"]}</span>'
                  f'<span style="font-size: 13.5px; line-height: 1.45; color: {SOFT};">{short}</span></div></a>')
    inner = (f'<div style="width: 100%; height: 100%; box-sizing: border-box; background: {INK}; color: {CREAM}; padding: 56px 64px; '
             'display: flex; flex-direction: column;">'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(244,237,226,0.5);">MESA &#183; HOW WAS IT? &#183; ROUND SIX</div>'
             f'<div style="font-family: {SERIF}; font-size: 56px; line-height: 1; margin-top: 10px;">Six from the bar</div>'
             f'<p style="margin: 12px 0 26px; font-size: 16px; line-height: 1.5; color: {SOFT}; max-width: 1060px;">Cocktail hour &mdash; the flute, the '
             'coupe, the rocks glass &mdash; drawn the same flat, thin-line way on the app&rsquo;s cream and black. At night the accent is the '
             'app&rsquo;s own burgundy now, not the pink from before. The phones play through the three answers by themselves; open one to see '
             'every answer in both themes.</p>'
             f'<div style="display: flex; gap: 16px;">{big}</div>'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(244,237,226,0.5); margin: 40px 0 14px;">'
             'FOR A NIGHT OUT, FROM BEFORE</div>'
             f'<div style="display: flex; gap: 16px;">{small}</div></div>')
    css = (R3.AMBIENT + f".offset *:not(.waft):not(.fizz):not(.twinkle) {{ animation-delay: {R4.DELAY} !important; }}\n"
           ".tile { transition: transform 150ms ease; } .tile:hover { transform: translateY(-3px); }\n"
           f".tile:focus-visible {{ outline: 2px solid {CREAM}; outline-offset: 3px; }}\n"
           "@media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile:hover { transform: none; } }\n"
           + "\n".join(kf.values()))
    return "Main.dc.html", "Start here", w, h, R3.page("How was it, round six", w, h, inner, css)


def main():
    os.makedirs(OUT, exist_ok=True)
    mp = main_page()
    new = [R3.dir_board(n, d) for n, d in enumerate(NEW, 17)]
    old = [R3.dir_board(n, d) for n, d, _ in BEFORE]
    remap = json.load(open(os.path.join(HERE, "photos8.json")))
    boards = {mp[0]: {"x": 0, "y": 0, "w": mp[2], "h": mp[3], "title": "Start here", "is_interactive": True}}
    order = [mp[0]]
    notes = {"n0": {"kind": "title1", "maxW": mp[2], "text": "How was it? — six from the bar", "x": 0, "y": -300}}
    y = mp[3] + 420
    for gid, label, group, nums in [("n1", "Six from the bar · 17 to 22", new, range(17, 23)),
                                    ("n2", "For a night out, from before · 4, 8", old, [4, 8])]:
        bw, bh = group[0][2], group[0][3]
        notes[gid] = {"kind": "title1", "maxW": 2 * bw + 80, "text": label, "x": 0, "y": y - 300}
        for i, ((fname, title, w, h, _), n) in enumerate(zip(group, nums)):
            boards[fname] = {"x": (i % 2) * (bw + 80), "y": y + (i // 2) * (bh + 120), "w": w, "h": h, "title": f"{n} · {title}"}
            order.append(fname)
        y += ((len(group) + 1) // 2) * (bh + 120) + 300
    for fname, _, _, _, html in [mp] + new + old:
        for a, b in remap.items():
            html = html.replace(a, b)
        with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
            f.write(html)
    canvas = {"v": 3, "attachments": {}, "boards": boards, "createdOnFiles": {"at": "2026-09-29T09:40:00Z", "v": 1}, "designSystems": [],
              "launch": {"file": "Main.dc.html", "view": "focused"}, "notes": notes, "order": order, "pages": [], "title": "Mesa Rating Cocktails"}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, indent=1, ensure_ascii=False)
    for fname, _, w, h, html in [mp] + new + old:
        print(f"{fname:22s} {w}x{h} {len(html) / 1024:6.0f} KB")


if __name__ == "__main__":
    main()
