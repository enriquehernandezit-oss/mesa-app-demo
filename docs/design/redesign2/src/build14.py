#!/usr/bin/env python3
"""Mesa — "How was it?", round five: six options drawn from the meal itself (Clean plate, The table, On the menu, Steam,
The check, Sobremesa) in round three's flat, thin-line family, plus the three dining ones from before (Ring, Cheers,
Table code) for comparison. Numbered 11-16, continuing rounds three and four."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mesa_ui import SERIF, img  # noqa: E402
import build13 as R4  # noqa: E402  (importing it gives round three's screen the reduced-motion fallback)
from build13 import BOX, MOVE, R3, st, svg  # noqa: E402

OUT = os.path.join(HERE, "dining", "project")
WAFT = """
@keyframes waft { 0% { transform: translate(-3px, 5px); opacity: 0.5; } 100% { transform: translate(3px, -5px); opacity: 1; } }
.waft { animation: waft 2.6s ease-in-out infinite alternate; transform-box: view-box; }
@media (prefers-reduced-motion: reduce) { .waft { animation: none !important; } }
"""
R3.AMBIENT = R3.AMBIENT + WAFT  # the boards' pages pick up the steam's drift
PLATE = ('<circle cx="150" cy="150" r="140" style="fill: var(--card); stroke: var(--g-line); stroke-width: 1.5;"/>'
         '<circle cx="150" cy="150" r="100" style="fill: none; stroke: var(--g-line); stroke-width: 1.2;"/>')
OVERLAY = '<svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true" style="position: absolute; inset: 0; overflow: visible;">'


def pen(name, d, j, s, kf, color, width=2.6, length=900):
    """A pen stroke that draws itself in when answer j is picked and is gone otherwise."""
    style = st(name, {"stroke-dashoffset": ["0px" if k == j else f"{length}px" for k in range(3)],
                      "opacity": ["1" if k == j else "0" for k in range(3)]}, s, kf)
    return (f'<path d="{d}" style="fill: none; stroke: {color}; stroke-width: {width}; stroke-linecap: round; stroke-linejoin: round; '
            f'stroke-dasharray: {length}px; {style}"/>')


# ================================================================ 11 · CLEAN PLATE (barely touched → half → wiped clean)

def plate_graphic(s, kf, p):
    left = st(f"{p}bite", {"clip-path": ["circle(84px at 100px 100px)", "circle(50px at 78px 118px)", "circle(0px at 96px 104px)"]}, s, kf)
    swipe = st(f"{p}sw", {"stroke-dashoffset": ["160px", "160px", "0px"]}, s, kf)
    crumbs = st(f"{p}cr", {"opacity": ["0", "0", "1"]}, s, kf)
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="{r}"/>' for x, y, r in [(120, 118, 2.2), (186, 172, 1.8), (172, 104, 1.6), (106, 192, 1.9), (204, 150, 1.4)])
    marks = (f'<path d="M 98 178 C 126 152 172 140 208 128" style="fill: none; stroke: var(--g-acc); stroke-width: 10; stroke-linecap: round; '
             f'stroke-dasharray: 160px; {swipe}"/><g style="fill: var(--muted); {crumbs}">{dots}</g>')
    food = (f'<div style="position: absolute; left: 50px; top: 50px; width: 200px; height: 200px; {left}">'
            f'{img("mofongo", " object-position: 77% 50%; transform: scale(1.6);")}</div>')
    return BOX + OVERLAY + PLATE + marks + "</svg>" + food + "</div>"


# ================================================================ 12 · THE TABLE (just you → four → all eight)

SEATS = [(0, "011"), (45, "001"), (90, "011"), (135, "001"), (180, "111"), (225, "001"), (270, "011"), (315, "001")]


def table_graphic(s, kf, p):
    out = ""
    for k, (a, mask) in enumerate(SEATS):
        on = [c == "1" for c in mask]
        chair = st(f"{p}c{k}", {"opacity": ["1" if v else "0" for v in on], "transform": ["translateY(0px)" if v else "translateY(-18px)" for v in on],
                                "stroke": ["var(--fg)", "var(--fg)", "var(--g-acc)"]}, s, kf, MOVE)
        setting = st(f"{p}s{k}", {"opacity": ["1" if v else "0" for v in on], "transform": ["scale(1)" if v else "scale(0.4)" for v in on]}, s, kf,
                     "transform-box: fill-box; transform-origin: center;")
        out += (f'<g transform="rotate({a} 150 150)"><g style="fill: none; stroke-linecap: round; stroke-linejoin: round; {chair}">'
                '<rect x="133" y="46" width="34" height="26" rx="7" style="stroke-width: 2;"/><path d="M 132 38 L 168 38" style="stroke-width: 3.4;"/></g>'
                f'<g style="{setting}"><circle cx="150" cy="104" r="12" style="fill: none; stroke: var(--fg); stroke-width: 1.4;"/>'
                '<circle cx="150" cy="104" r="6.5" style="fill: none; stroke: var(--g-line); stroke-width: 1.2;"/></g></g>')
    return svg('<circle cx="150" cy="150" r="66" style="fill: var(--card); stroke: var(--g-line); stroke-width: 1.5;"/>' + out)


# ================================================================ 13 · ON THE MENU (crossed out → underlined → circled)

DISHES = ["Mofongo de camarones", "Chivo guisado", "Sancocho", "Habichuelas con dulce"]
MENU_MARKS = [
    ("var(--fg)", "M 54 80 C 96 74 140 82 184 76 S 236 74 250 77"),
    ("var(--fg)", "M 62 98 C 108 102 196 101 242 95"),
    ("var(--g-acc)", "M 232 64 C 206 52 94 52 62 66 C 40 76 46 96 86 101 C 134 107 218 103 246 90 C 262 80 254 64 212 58"),
]


def menu_graphic(s, kf, p):
    dishes = "".join(f'<span style="font-size: 13px; line-height: 1; color: var(--fg2);">{d}</span>' for d in DISHES)
    card = ('<div style="position: absolute; left: 32px; top: 6px; width: 236px; height: 288px; box-sizing: border-box; border-radius: 18px; '
            'background: var(--card); padding: 30px 20px 0; display: flex; flex-direction: column; align-items: center;">'
            '<span style="font-size: 11px; line-height: 1; font-weight: 700; letter-spacing: 0.1em; color: var(--muted);">MENU</span>'
            f'<span style="font-family: {SERIF}; font-size: 28px; line-height: 1; margin-top: 16px; white-space: nowrap; color: var(--fg);">Adrian Tropical</span>'
            '<span style="width: 36px; height: 1.5px; background: var(--g-line); margin: 26px 0 22px;"></span>'
            f'<div style="display: flex; flex-direction: column; align-items: center; gap: 14px;">{dishes}</div></div>')
    marks = "".join(pen(f"{p}m{j}", d, j, s, kf, color) for j, (color, d) in enumerate(MENU_MARKS))
    return BOX + card + OVERLAY + marks + "</svg></div>"


# ================================================================ 14 · STEAM (gone cold → one wisp → three, and the bowl warms)

BOWL = "M 56 170 L 244 170 C 240 218 200 248 150 248 C 100 248 60 218 56 170 Z"
FOOT = "M 120 248 L 116 258 L 184 258 L 180 248 Z"


def steam_graphic(s, kf, p):
    body = st(f"{p}bw", {"fill": ["var(--card)", "var(--card)", "var(--g-acc)"], "stroke": ["var(--muted)", "var(--fg)", "var(--g-acc)"]}, s, kf)
    wisps = ""
    for j, (x, on) in enumerate([(112, ["0", "0", "1"]), (150, ["0", "0.75", "1"]), (188, ["0", "0", "1"])]):
        wisps += (f'<g style="{st(f"{p}w{j}", {"opacity": on}, s, kf)}"><g class="waft" style="animation-delay: -{j * 0.9:.1f}s;">'
                  f'<path d="M {x} 152 C {x - 14} 130 {x + 14} 112 {x} 90 C {x - 14} 68 {x + 14} 50 {x} 30" '
                  'style="fill: none; stroke: var(--fg); stroke-width: 2.4; stroke-linecap: round;"/></g></g>')
    return svg(wisps + f'<g style="stroke-width: 2.2; stroke-linejoin: round; {body}"><path d="{BOWL}"/><path d="{FOOT}"/></g>')


# ================================================================ 15 · THE CHECK (no tip + a scrawl → 10% → 20% + a flourish)

TIP_MARKS = [
    ("var(--fg)", "M 134 202 C 166 199 206 204 246 200"),
    ("var(--fg)", "M 165 194 C 155 188 137 190 134 200 C 132 210 149 214 161 210 C 171 206 171 196 159 192"),
    ("var(--g-acc)", "M 241 194 C 231 188 213 190 210 200 C 208 210 225 214 237 210 C 247 206 247 196 235 192"),
]
SIGNATURES = [
    ("var(--fg)", "M 70 254 C 80 244 88 256 98 248 C 106 242 112 254 122 250 L 134 248"),
    ("var(--fg)", "M 68 256 C 74 230 88 228 86 248 C 84 260 98 248 106 240 C 114 232 116 250 126 248 C 136 246 138 236 146 240 "
                  "C 154 244 154 254 166 250 C 176 246 182 240 194 244"),
    ("var(--g-acc)", "M 64 256 C 70 212 100 210 92 244 C 88 260 108 238 118 230 C 128 222 128 248 140 244 C 154 240 154 224 168 228 "
                     "C 182 232 172 254 188 248 C 206 242 216 210 230 220 C 242 230 218 260 178 264 C 138 268 98 266 72 260"),
]


def check_graphic(s, kf, p):
    x0, x1, bot = 40, 260, 286
    teeth = " ".join(f"L {x1 - 5 - 10 * i} {bot + 8} L {x1 - 10 * (i + 1)} {bot}" for i in range(22))
    paper = f'<path d="M {x0} 12 Q {x0} 0 {x0 + 12} 0 L {x1 - 12} 0 Q {x1} 0 {x1} 12 L {x1} {bot} {teeth} Z" style="fill: var(--card);"/>'

    def row(y, left, right="", color="var(--fg)"):
        out = f'<text x="58" y="{y}" style="font-size: 12px; fill: {color};">{left}</text>'
        if right:
            out += f'<text x="242" y="{y}" text-anchor="end" style="font-size: 12px; fill: {color}; font-variant-numeric: tabular-nums;">{right}</text>'
        return out

    def rule(y):
        return f'<line x1="58" y1="{y}" x2="242" y2="{y}" style="stroke: var(--g-line); stroke-width: 1.2; stroke-dasharray: 3 3;"/>'

    tips = "".join(f'<text x="{x}" y="206" text-anchor="middle" style="font-size: 12px; font-weight: 600; fill: var(--fg);">{t}</text>'
                   for x, t in [(150, "10%"), (188, "15%"), (226, "20%")])
    text = (f'<text x="150" y="36" text-anchor="middle" style="font-family: {SERIF}; font-size: 23px; fill: var(--fg);">Adrian Tropical</text>'
            '<text x="150" y="54" text-anchor="middle" style="font-size: 11px; fill: var(--muted);">Mesa 12 &#183; 2 personas</text>'
            + rule(68) + row(88, "Mofongo de camarones", "650") + row(106, "Chivo guisado", "590") + rule(120)
            + row(138, "Subtotal", "1,240", "var(--muted)") + row(155, "ITBIS 18%", "223", "var(--muted)") + row(172, "Ley 10%", "124", "var(--muted)")
            + rule(186) + row(206, "Propina") + tips
            + '<line x1="58" y1="262" x2="242" y2="262" style="stroke: var(--g-line); stroke-width: 1.2;"/>'
            '<text x="58" y="278" style="font-size: 10px; fill: var(--muted);">Firma</text>')
    marks = "".join(pen(f"{p}t{j}", d, j, s, kf, c, 2.2) for j, (c, d) in enumerate(TIP_MARKS))
    marks += "".join(pen(f"{p}g{j}", d, j, s, kf, c, 2.2) for j, (c, d) in enumerate(SIGNATURES))
    return svg(paper + text + marks)


# ================================================================ 16 · SOBREMESA (the check straight away → two coffees → coffee and a flan)

T, K = 226, 1.6  # the tabletop, and how much the little drawings are enlarged
CUP = ('<path d="M -15 -34 L 15 -34 L 12 -11 C 11 -6 -11 -6 -12 -11 Z" style="fill: var(--card);"/>'
       '<path d="M 14 -29 C 25 -29 25 -16 12 -16" style="fill: none;"/><path d="M -27 -2 C -20 1 20 1 27 -2" style="fill: none;"/>')
FLAN = ('<path d="M -34 -2 C -20 1 20 1 34 -2" style="fill: none;"/><path d="M -21 -6 L -15 -32 L 15 -32 L 21 -6 Z" style="fill: var(--card);"/>'
        '<path d="M -15.4 -32 L 15.4 -32 L 16.7 -26 C 13 -24 11 -20 9 -26 C 5 -23 -1 -23 -3 -26 C -7 -21 -11 -23 -16.7 -26 Z" '
        'style="fill: var(--g-acc); stroke: none;"/>')
CHECK = ('<path d="M 14 -8 L 18 -19 L 34 -16 L 31 -8" style="fill: var(--card);"/>'  # the receipt's corner, sticking out
         '<path d="M -36 0 L -36 -8 L 36 -8 L 36 0 Z" style="fill: var(--card);"/>'  # the check folder, closed, lying flat
         '<path d="M -28 -9 L 14 -9 C 16.5 -9 16.5 -13.5 14 -13.5 L -28 -13.5 C -30.5 -13.5 -30.5 -9 -28 -9 Z" style="fill: var(--card);"/>')  # a pen on it


def sobremesa_graphic(s, kf, p):
    def item(key, art, places, shown):
        at = st(f"{p}{key}", {"transform": places, "opacity": shown}, s, kf, MOVE + " transform-origin: 0 0;")
        return f'<g style="stroke: var(--fg); stroke-width: {2 / K:.2f}; stroke-linecap: round; stroke-linejoin: round; {at}">{art}</g>'

    def at(x, dy=0, flip=False):
        return f"translate({x}px, {T + dy}px) scale({-K if flip else K}, {K})"

    out = item("ck", CHECK, [at(150), at(150, 12), at(150, 12)], ["1", "0", "0"])
    out += item("cl", CUP, [at(102, 0, True), at(96, 0, True), at(49, 0, True)], ["0", "1", "1"])
    out += item("cr", CUP, [at(198), at(204), at(251)], ["0", "1", "1"])
    out += item("fl", FLAN, [at(150, 12), at(150, 12), at(150)], ["0", "0", "1"])
    return svg(f'<line x1="8" y1="{T}" x2="292" y2="{T}" style="stroke: var(--g-line); stroke-width: 1.5; stroke-linecap: round;"/>' + out)


# ================================================================ the canvas

NEW = [
    dict(pre="cp", name="Clean plate", file="F11-Plate.dc.html", graphic=plate_graphic,
         short="The portion shrinks the more you liked it; loved it leaves a clean plate and a swipe of sauce.",
         sub="Your plate from above: barely touched, half finished, or wiped clean with one swipe of sauce left &mdash; the oldest "
             "compliment a kitchen gets."),
    dict(pre="lm", name="The table", file="F12-Table.dc.html", graphic=table_graphic,
         short="A round table from above: just you, a table for four, then all eight seats.",
         sub="A round table seen from above, filling up: just you, a table for four, then all eight seats in burgundy &mdash; how many "
             "people you&rsquo;d bring back. Mesa means table, after all."),
    dict(pre="me", name="On the menu", file="F13-Menu.dc.html", graphic=menu_graphic,
         short="The place&rsquo;s name on its menu, marked by your pen: crossed out, underlined, circled.",
         sub="Adrian Tropical&rsquo;s menu with your pen on it: the name crossed out, underlined, or circled in burgundy &mdash; the way "
             "you&rsquo;d mark a menu you&rsquo;re keeping."),
    dict(pre="sm", name="Steam", file="F14-Steam.dc.html", graphic=steam_graphic,
         short="A bowl gone cold, a single wisp, then three rising while the bowl turns burgundy.",
         sub="A bowl seen from the side: gone cold, a single wisp of steam, or three wisps rising while the bowl turns burgundy. "
             "The steam never stops moving."),
    dict(pre="bk", name="The check", file="F15-Check.dc.html", graphic=check_graphic,
         short="The receipt: no extra tip and a scrawl, 10% and a signature, 20% and a flourish.",
         sub="The receipt at the end of the night, ITBIS and the 10% ley already on it: no extra tip and a scrawl, 10% and a plain "
             "signature, or 20% circled and signed with a flourish."),
    dict(pre="sb", name="Sobremesa", file="F16-Sobremesa.dc.html", graphic=sobremesa_graphic,
         short="What stays on the table: the check straight away, two coffees, or coffees and a flan to share.",
         sub="The time you stay at the table after eating: the check comes straight away, two coffees, or two coffees and a flan "
             "to share &mdash; nobody wants to leave."),
]
BEFORE = [(1, R3.DIRS[0], "The dish as a plate; a thin burgundy ring fills a third, two-thirds, or all the way."),
          (8, R4.NEW[3], "Two glasses stand apart, side by side, or lift and clink."),
          (10, R4.NEW[5], "Fork and knife placed the way waiters read them: crossed, at four o&rsquo;clock, straight across.")]
INK, CREAM, SOFT, ROSE = R4.INK, R4.CREAM, R4.SOFT, R4.ROSE


def main_page():
    w, h = 1680, 1250
    kf = {}
    big = ""
    for n, d in enumerate(NEW, 11):
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
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(244,237,226,0.5);">MESA &#183; HOW WAS IT? &#183; ROUND FIVE</div>'
             f'<div style="font-family: {SERIF}; font-size: 56px; line-height: 1; margin-top: 10px;">Six from the table</div>'
             f'<p style="margin: 12px 0 26px; font-size: 16px; line-height: 1.5; color: {SOFT}; max-width: 1060px;">Every one of these comes from the '
             'meal itself &mdash; the plate, the table, the menu, the check &mdash; drawn the same flat, thin-line way on the app&rsquo;s cream and '
             'black, with a bit of burgundy. The phones play through the three answers by themselves; open one to see every answer in both themes.</p>'
             f'<div style="display: flex; gap: 16px;">{big}</div>'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(244,237,226,0.5); margin: 40px 0 14px;">'
             'THE DINING ONES FROM BEFORE</div>'
             f'<div style="display: flex; gap: 16px;">{small}</div></div>')
    css = (R3.AMBIENT + f".offset *:not(.waft) {{ animation-delay: {R4.DELAY} !important; }}\n"
           ".tile { transition: transform 150ms ease; } .tile:hover { transform: translateY(-3px); }\n"
           f".tile:focus-visible {{ outline: 2px solid {CREAM}; outline-offset: 3px; }}\n"
           "@media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile:hover { transform: none; } }\n"
           + "\n".join(kf.values()))
    return "Main.dc.html", "Start here", w, h, R3.page("How was it, round five", w, h, inner, css)


def main():
    os.makedirs(OUT, exist_ok=True)
    mp = main_page()
    new = [R3.dir_board(n, d) for n, d in enumerate(NEW, 11)]
    old = [R3.dir_board(n, d) for n, d, _ in BEFORE]
    remap = json.load(open(os.path.join(HERE, "photos7.json")))
    boards = {mp[0]: {"x": 0, "y": 0, "w": mp[2], "h": mp[3], "title": "Start here", "is_interactive": True}}
    order = [mp[0]]
    notes = {"n0": {"kind": "title1", "maxW": mp[2], "text": "How was it? — six from the table", "x": 0, "y": -300}}
    y = mp[3] + 420
    for gid, label, group, nums in [("n1", "Six from the table · 11 to 16", new, range(11, 17)),
                                    ("n2", "The dining ones from before · 1, 8, 10", old, [1, 8, 10])]:
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
    canvas = {"v": 3, "attachments": {}, "boards": boards, "createdOnFiles": {"at": "2026-09-29T08:30:00Z", "v": 1}, "designSystems": [],
              "launch": {"file": "Main.dc.html", "view": "focused"}, "notes": notes, "order": order, "pages": [], "title": "Mesa Rating Dining"}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, indent=1, ensure_ascii=False)
    for fname, _, w, h, html in [mp] + new + old:
        print(f"{fname:22s} {w}x{h} {len(html) / 1024:6.0f} KB")


if __name__ == "__main__":
    main()
