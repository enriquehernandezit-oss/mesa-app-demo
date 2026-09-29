#!/usr/bin/env python3
"""Mesa — 17 Bubbles redrawn realistically, in the same hand as the realistic rocks glasses: a flute with a thin stem and
foot, a deep ruby Kir Royale with a real surface, bubbles rising in streams and growing as they climb, the bowl fogging
when it is cold, and a fizz over the rim when you loved it. Rebuilds the Cocktails canvas."""
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build16 as R7  # noqa: E402  (applies the realistic Ice and Smoke)
from build13 import R3, st, svg  # noqa: E402

R6 = R7.R6
R3.AMBIENT += """
@keyframes rise { 0% { transform: translateY(0px) scale(0.55); opacity: 0; } 10% { opacity: 1; } 88% { opacity: 1; } 100% { transform: translateY(var(--rise)) scale(1.25); opacity: 0; } }
.rise { animation: rise 3s cubic-bezier(.45,0,.9,.6) infinite; transform-box: fill-box; transform-origin: center; }
@media (prefers-reduced-motion: reduce) { .rise { animation: none !important; } }
"""
S = 58  # the surface of the drink
OUTER = "M 123 34 C 121 92 127 152 145 196 L 155 196 C 173 152 179 92 177 34 A 27 5 0 0 0 123 34 Z"
CAVITY = "M 125.5 35 C 123.5 92 129 150 146.5 192 L 153.5 192 C 171 150 176.5 92 174.5 35 A 24.5 4.5 0 0 0 125.5 35 Z"
BOWL = "M 123 34 C 121 92 127 152 145 196 L 155 196 C 173 152 179 92 177 34 Z"
STEM = "M 146.5 196 C 148 212 148 240 147.4 258 L 152.6 258 C 152 240 152 212 153.5 196 Z"


def bubble(x, y0, r, dur, delay):
    return (f'<circle cx="{x}" cy="{y0}" r="{r}" class="rise" style="fill: rgba(255,255,255,0.3); stroke: rgba(255,250,246,0.9); stroke-width: 0.6; '
            f'--rise: -{y0 - S - 3}px; animation-duration: {dur}s; animation-delay: -{delay}s;"/>')


def streams(rnd, spots, per, dur):
    out = ""
    for x, y0 in spots:
        for i in range(per):
            out += bubble(x + rnd.uniform(-0.8, 0.8), y0, round(rnd.uniform(0.9, 1.7), 2), round(dur * rnd.uniform(0.85, 1.15), 2), round(i * dur / per, 2))
    return out


KIR = dict(drink=[(0, "#7a1a2d", 1), (0.55, "#561020", 1), (1, "#2a050c", 1)], flat=[(0, "#5e3134", 1), (1, "#291214", 1)],
           surface="#661526", glow="#8e1d31", pool="#7a1a29", rim="#ffffff", rim_w=1.5)
BRASS = dict(drink=[(0, "#d9b36a", 1), (0.55, "#a8803a", 1), (1, "#5e431b", 1)], flat=[(0, "#8c7c5e", 1), (1, "#433722", 1)],
             surface="#c89f55", glow="#e8c373", pool="#b08a3e", rim="#c9a45a", rim_w=2.4)


def flute_real_graphic(s, kf, p, look=KIR):
    uid, night = f"{p}{s}", p.endswith("N")
    rnd = random.Random(3)
    edge = "rgba(244,237,226,0.38)" if night else "rgba(40,28,24,0.34)"
    body = "rgba(255,255,255,0.05)" if night else "rgba(255,255,255,0.3)"
    defs = (f'<clipPath id="fc{uid}"><path d="{CAVITY}"/></clipPath>'
            f'<clipPath id="fs{uid}"><rect x="0" y="{S + 1}" width="300" height="240"/></clipPath>'
            f'<clipPath id="fb{uid}"><path d="{BOWL}"/></clipPath>'
            + R7.grad(f"kr{uid}", look["drink"])
            + R7.grad(f"kf{uid}", look["flat"])
            + R7.grad(f"ky{uid}", [(0, "#000", 0.5), (0.2, "#000", 0.08), (0.36, "#fff", 0.08), (0.6, "#000", 0), (1, "#000", 0.55)], 1, 0)
            + R7.grad(f"ks{uid}", [(0, "#fff", 0), (0.1, "#fff", 0.9 if not night else 0.75), (0.75, "#fff", 0.45), (1, "#fff", 0)])
            + f'<radialGradient id="ksh{uid}"><stop offset="0" stop-color="#3c2618" stop-opacity="{0 if night else 0.28}"/>'
              f'<stop offset="1" stop-color="#3c2618" stop-opacity="0"/></radialGradient>'
            f'<filter id="kb{uid}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>')
    flat = st(f"{p}fl", {"opacity": ["1", "0", "0"]}, s, kf)
    some = st(f"{p}bs", {"opacity": ["0", "1", "1"]}, s, kf)
    lots = st(f"{p}bl", {"opacity": ["0", "0", "1"]}, s, kf)
    cold = st(f"{p}fg", {"opacity": ["0", "0.7", "1"]}, s, kf)

    drink = (f'<g clip-path="url(#fc{uid})">'
             f'<rect x="120" y="{S}" width="60" height="140" fill="url(#kr{uid})"/>'
             f'<rect x="120" y="{S}" width="60" height="140" fill="url(#kf{uid})" style="{flat}"/>'
             f'<rect x="120" y="{S}" width="60" height="140" fill="url(#ky{uid})"/>'
             f'<ellipse cx="150" cy="186" rx="9" ry="10" style="fill: {look['glow']}; opacity: 0.35; filter: url(#kb{uid});"/>'
             f'<ellipse cx="150" cy="{S}" rx="25" ry="4.6" style="fill: {look['surface']};"/>'
             f'<path d="M 125 {S} A 25 4.6 0 0 0 175 {S}" style="fill: none; stroke: #ffffff; stroke-opacity: 0.45; stroke-width: 1;"/></g>')
    few = streams(rnd, [(150, 188)], 7, 4.2)
    many = streams(rnd, [(149, 188), (152, 186), (141, 150), (160, 126), (137, 104)], 6, 2.4)
    cling = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rnd.uniform(0.7, 1.4):.1f}" style="fill: none; stroke: rgba(255,248,244,0.75); stroke-width: 0.6;"/>'
                    for x, y in [(129 + rnd.uniform(0, 3), rnd.uniform(70, 150)) for _ in range(7)] + [(171 - rnd.uniform(0, 3), rnd.uniform(70, 150)) for _ in range(7)])
    mousse = "".join(f'<circle cx="{150 + 24 * rnd.uniform(-1, 1):.1f}" cy="{S + rnd.uniform(1, 4.2):.1f}" r="{rnd.uniform(0.7, 1.6):.1f}" '
                     'style="fill: #f6eadf; opacity: 0.85;"/>' for _ in range(26))
    spray = "".join(f'<circle cx="{150 + rnd.uniform(-20, 20):.1f}" cy="{rnd.uniform(8, 30):.1f}" r="{rnd.uniform(0.6, 1.4):.1f}" class="twinkle" '
                    f'style="fill: {"#f4ede2" if night else "#8a6a60"}; animation-delay: -{rnd.uniform(0, 1.8):.2f}s;"/>' for _ in range(12))
    bubbles = (f'<g clip-path="url(#fc{uid})"><g clip-path="url(#fs{uid})">'
               f'<g style="{some}">{few}</g><g style="{lots}">{many}{cling}</g></g></g><g style="{lots}">{mousse}{spray}</g>')
    fog = (f'<g clip-path="url(#fb{uid})" style="{cold}"><g clip-path="url(#fs{uid})">'
           f'<rect x="118" y="{S}" width="64" height="140" style="fill: #ffffff; opacity: {0.03 if night else 0.14};"/>'
           + "".join(f'<circle cx="{rnd.uniform(124, 176):.1f}" cy="{rnd.uniform(S + 6, 180):.1f}" r="{rnd.uniform(0.6, 1.6):.1f}" '
                     f'style="fill: #ffffff; opacity: {rnd.uniform(0.35, 0.8) * (0.6 if night else 1):.2f};"/>' for _ in range(40)) + '</g></g>')
    glass = (f'<path d="{OUTER}" style="fill: {body};"/>'
             f'<path d="M 123 34 A 27 5 0 0 1 177 34" style="fill: none; stroke: {edge}; stroke-width: 1.1;"/>'
             + drink + bubbles + fog
             + f'<path d="{OUTER}" style="fill: none; stroke: {edge}; stroke-width: 1.1;"/>'
             f'<path d="M 127 44 C 126 92 130 142 142 182 L 144.6 182 C 133 142 129.6 92 130.6 44 Z" fill="url(#ks{uid})"/>'
             f'<path d="M 172 50 C 173 92 170 138 159 178 L 160.4 178 C 171.4 138 174.6 92 173.6 50 Z" fill="url(#ks{uid})" style="opacity: 0.55;"/>'
             f'<path d="{STEM}" style="fill: #ffffff; opacity: {0.12 if night else 0.45}; stroke: {edge}; stroke-width: 0.9;"/>'
             '<path d="M 148.6 204 L 148.9 252" style="stroke: #ffffff; stroke-opacity: 0.8; stroke-width: 1; stroke-linecap: round;"/>'
             f'<ellipse cx="150" cy="264" rx="36" ry="7" style="fill: #ffffff; opacity: {0.1 if night else 0.4}; stroke: {edge}; stroke-width: 0.9;"/>'
             f'<ellipse cx="150" cy="262" rx="36" ry="7" style="fill: #ffffff; opacity: {0.08 if night else 0.35}; stroke: {edge}; stroke-width: 1;"/>'
             '<path d="M 118 263.5 A 32 5.5 0 0 0 182 263.5" style="fill: none; stroke: #ffffff; stroke-opacity: 0.8; stroke-width: 1.3; stroke-linecap: round;"/>'
             f'<path d="M 123 34 A 27 5 0 0 0 177 34" style="fill: none; stroke: {look["rim"]}; stroke-opacity: 0.95; stroke-width: {look["rim_w"]};"/>'
             + (f'<path d="M 123 34 A 27 5 0 0 1 177 34" style="fill: none; stroke: {look["rim"]}; stroke-width: 1.4;"/>'
                f'<path d="M 114 264 A 36 7 0 0 0 186 264" style="fill: none; stroke: {look["rim"]}; stroke-width: 2;"/>' if look is BRASS else "")
             + ("" if night else '<path d="M 123 35.2 A 27 5 0 0 0 177 35.2" style="fill: none; stroke: rgba(40,28,24,0.28); stroke-width: 0.9;"/>'))
    under = (f'<ellipse cx="150" cy="268" rx="62" ry="10" fill="url(#ksh{uid})"/>'
             f'<ellipse cx="166" cy="269" rx="30" ry="5" style="fill: {look['pool']}; opacity: {0.3 if night else 0.22}; filter: url(#kb{uid});"/>')
    return svg(under + glass, defs)


R6.NEW[0].update(graphic=flute_real_graphic,
                 short="A real flute of Kir Royale: gone flat, a slow thin stream, or lively bubbles fizzing over the rim.",
                 sub="A Kir Royale in a real champagne flute: gone flat and dull, a slow thin stream of bubbles in a cold, misted glass, "
                     "or lively streams climbing from the bottom, a ring of mousse and a fizz over the rim.")

def brass_graphic(s, kf, p):
    return flute_real_graphic(s, kf, p, BRASS)


BRASS_DIR = dict(pre="bb", name="Bubbles in brass", file="F25-Bubbles-brass.dc.html", graphic=brass_graphic,
                 sub="The same real flute in brass: golden champagne and a gilded rim and foot &mdash; gone flat, a slow thin stream, or "
                     "lively bubbles fizzing over the rim.")


def main():
    import json
    R6.BEFORE = [(25, BRASS_DIR, "The realistic flute in brass: golden champagne, a gilded rim and foot.")] + R6.BEFORE
    mp = R6.main_page()
    mp = (mp[0], mp[1], mp[2], mp[3], mp[4].replace("FOR A NIGHT OUT, FROM BEFORE", "IN BRASS &#183; AND FOR A NIGHT OUT, FROM BEFORE"))
    boards = [mp, R3.dir_board(17, R6.NEW[0]), R3.dir_board(25, BRASS_DIR)]
    remap = json.load(open(os.path.join(HERE, "photos8.json")))
    for fname, _, _, _, html in boards:
        for a, b in remap.items():
            html = html.replace(a, b)
        with open(os.path.join(R6.OUT, fname), "w", encoding="utf-8") as f:
            f.write(html)
        print(fname, f"{len(html) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
