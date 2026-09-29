#!/usr/bin/env python3
"""Mesa — "How was it?", round four: six more flat, grown-up graphics in round three's vein (Sunrise, Dial, Heart,
Cheers, Dots, Table code), plus round three's Ring, Moon, Line and Wave so all ten sit in one canvas, numbered 1-10
across both rounds. Same screen, same slider, same 10-second demo as round three; only the graphic changes."""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mesa_ui import SERIF  # noqa: E402
import build11  # noqa: E402
import build12 as R3  # noqa: E402  (round three: screen, slider, words, board + page shells, Ring/Moon/Line/Wave)

OUT = os.path.join(HERE, "flat2", "project")
MOVE = R3.MOVE
BOX = '<div style="position: absolute; top: 168px; left: 50%; width: 300px; height: 300px; margin-left: -150px;">'


def st(name, props, s, kf, extra=""):
    """build11.st, but a demo element also carries the Loved-it values inline, so it rests on a real answer when
    reduced motion switches the animation off (the running animation overrides them)."""
    if s is None:
        kf[name] = build11.keyframes(name, props)
        rest = " ".join(f"{k}: {v[2]};" for k, v in props.items())
        return f"{extra} {rest} animation: {name} {build11.DUR} {build11.EASE} infinite;".strip()
    return build11.st(name, props, s, kf, extra)


R3.st = st  # round three's screen, words and slider pick up the same fallback


def svg(inner, defs=""):
    return (BOX + '<svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true" style="overflow: visible;">'
            + (f"<defs>{defs}</defs>" if defs else "") + inner + "</svg></div>")


def polar(cx, cy, r, deg):
    """A point on a circle, degrees clockwise from twelve o'clock."""
    a = math.radians(deg)
    return cx + r * math.sin(a), cy - r * math.cos(a)


# ================================================================ 5 · SUNRISE (a flat sun on a thin horizon)

def sunrise_graphic(s, kf, p):
    H, RS, UP = 214, 80, 96
    cid = f"sky{p}{s}"
    sun = st(f"{p}sun", {"transform": ["translateY(58px)", "translateY(0px)", f"translateY(-{UP}px)"],
                         "fill": ["var(--muted)", "var(--fg)", "var(--g-acc)"]}, s, kf, MOVE)
    cy2 = H - UP
    rays = "".join('<line x1="{:.1f}" y1="{:.1f}" x2="{:.1f}" y2="{:.1f}"/>'.format(*polar(150, cy2, RS + 13, a), *polar(150, cy2, RS + 30, a))
                   for a in range(0, 360, 15))
    ray = st(f"{p}rays", {"opacity": ["0", "0", "1"], "transform": ["scale(0.9)", "scale(0.9)", "scale(1)"]}, s, kf,
             MOVE + f" transform-origin: 150px {cy2}px;")
    refl = ""
    for i, (dy, half) in enumerate([(14, 92), (27, 66), (40, 42), (53, 20)]):
        rf = st(f"{p}rf{i}", {"transform": ["scaleX(0.3)", "scaleX(0.62)", "scaleX(1)"],
                              "stroke": ["var(--g-line)", "var(--g-line)", "var(--g-acc)"]}, s, kf, MOVE + " transform-origin: 150px 0;")
        refl += f'<line x1="{150 - half}" y1="{H + dy}" x2="{150 + half}" y2="{H + dy}" style="stroke-width: 2; stroke-linecap: round; {rf}"/>'
    return svg(f'<g clip-path="url(#{cid})"><circle cx="150" cy="{H}" r="{RS}" style="{sun}"/>'
               f'<g style="stroke: var(--g-acc); stroke-width: 2; stroke-linecap: round; {ray}">{rays}</g></g>'
               f'<line x1="4" y1="{H}" x2="296" y2="{H}" style="stroke: var(--fg); stroke-width: 1.6; stroke-linecap: round;"/>{refl}',
               f'<clipPath id="{cid}"><rect x="-60" y="-60" width="420" height="{H + 57}"/></clipPath>')


# ================================================================ 6 · DIAL (a thin gauge on the list's own 0-10)

def dial_graphic(s, kf, p):
    cx, cy, R = 150, 182, 122
    fr = [0.012, 0.5, 1.0]
    mid, rm = f"dm{p}{s}", R - 7.5
    L = rm * math.radians(240)
    (x0, y0), (x1, y1) = polar(cx, cy, rm, -120), polar(cx, cy, rm, 120)
    sweep = st(f"{p}sw", {"stroke-dashoffset": [f"{L * (1 - f):.1f}px" for f in fr]}, s, kf)
    mask = (f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="300">'
            f'<path d="M {x0:.1f} {y0:.1f} A {rm} {rm} 0 1 1 {x1:.1f} {y1:.1f}" '
            f'style="fill: none; stroke: #fff; stroke-width: 18; stroke-linecap: round; stroke-dasharray: {L:.1f}px; {sweep}"/></mask>')
    base = lit = ""
    for i in range(41):
        a = -120 + i * 6
        major = i % 10 == 0
        (ax, ay), (bx, by) = polar(cx, cy, R - (15 if major else 8), a), polar(cx, cy, R, a)
        ln = f'<line x1="{ax:.1f}" y1="{ay:.1f}" x2="{bx:.1f}" y2="{by:.1f}" style="stroke-width: {2.2 if major else 1.5};"/>'
        base += ln
        lit += ln
    nums = "".join(f'<text x="{polar(cx, cy, R + 17, a)[0]:.1f}" y="{polar(cx, cy, R + 17, a)[1] + 4:.1f}" text-anchor="middle" '
                   f'style="fill: var(--muted); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;">{t}</text>'
                   for a, t in [(-120, "0"), (0, "5"), (120, "10")])
    needle = st(f"{p}nd", {"transform": [f"rotate({-120 + 240 * f:.1f}deg)" for f in fr]}, s, kf, MOVE + f" transform-origin: {cx}px {cy}px;")
    return svg(f'<g style="stroke: var(--g-line);">{base}</g><g mask="url(#{mid})" style="stroke: var(--g-acc);">{lit}</g>{nums}'
               f'<g style="{needle}"><line x1="{cx}" y1="{cy + 18}" x2="{cx}" y2="{cy - R + 26}" '
               'style="stroke: var(--g-acc); stroke-width: 2.4; stroke-linecap: round;"/></g>'
               f'<circle cx="{cx}" cy="{cy}" r="7" style="fill: var(--bg); stroke: var(--fg); stroke-width: 2.2;"/>', mask)


# ================================================================ 7 · HEART (fills with flat burgundy from the bottom)

HEART = ("M 150 262 C 124 244 36 188 36 112 C 36 70 66 44 101 44 C 124 44 141 57 150 76 "
         "C 159 57 176 44 199 44 C 234 44 264 70 264 112 C 264 188 176 244 150 262 Z")


def heart_graphic(s, kf, p):
    cid, top, bot = f"ht{p}{s}", 44, 262
    fill = st(f"{p}hf", {"transform": [f"translateY({(bot - top) * (1 - f):.1f}px)" for f in (0.18, 0.52, 1.0)]}, s, kf, MOVE)
    line = st(f"{p}hl", {"stroke": ["var(--fg)", "var(--fg)", "var(--g-acc)"]}, s, kf)
    echo = st(f"{p}he", {"opacity": ["0", "0", "1"], "transform": ["scale(1.04)", "scale(1.04)", "scale(1.13)"]}, s, kf,
              MOVE + " transform-origin: 150px 153px;")
    return svg(f'<g style="{echo}"><path d="{HEART}" style="fill: none; stroke: var(--g-acc); stroke-opacity: 0.35; stroke-width: 1.2;"/></g>'
               f'<g clip-path="url(#{cid})"><rect x="20" y="{top}" width="260" height="{bot - top + 10}" style="fill: var(--g-acc); {fill}"/></g>'
               f'<path d="{HEART}" style="fill: none; stroke-width: 2.4; stroke-linejoin: round; {line}"/>',
               f'<clipPath id="{cid}"><path d="{HEART}"/></clipPath>')


# ================================================================ 8 · CHEERS (two glasses: apart, side by side, a toast)

BOWL = "M -32 0 C -34 40 -24 76 0 84 C 24 76 34 40 32 0 Z"
GLASS = BOWL + " M 0 84 L 0 146 M -28 150 C -12 146 12 146 28 150"


def clink_x(alpha, half=32):
    """Where the left glass stands (foot x) so that, tilted by alpha about its foot, its rim meets the centre."""
    a = math.radians(alpha)
    return 150 - (half * math.cos(a) + 150 * math.sin(a))


def cheers_graphic(s, kf, p):
    tilt = 12
    cx_l = clink_x(tilt)
    places = {"L": [(60, 88, -8), (100, 88, 0), (cx_l, 64, tilt)], "R": [(240, 88, 8), (200, 88, 0), (300 - cx_l, 64, -tilt)]}
    contact_y = 64 + 150 + (32 * math.sin(math.radians(tilt)) - 150 * math.cos(math.radians(tilt)))
    glasses = ""
    for side, pos in places.items():
        cid = f"bw{side}{p}{s}"
        at = st(f"{p}g{side}", {"transform": [f"translate({x:.1f}px, {y}px) rotate({r}deg)" for x, y, r in pos]}, s, kf,
                MOVE + " transform-origin: 0 150px;")
        ink = st(f"{p}gi{side}", {"stroke": ["var(--muted)", "var(--fg)", "var(--fg)"]}, s, kf)
        glasses += (f'<g style="{at}"><clipPath id="{cid}"><path d="{BOWL}"/></clipPath>'
                    f'<g clip-path="url(#{cid})"><rect x="-40" y="36" width="80" height="60" style="fill: var(--g-acc);"/></g>'
                    f'<path d="{GLASS}" style="fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; {ink}"/></g>')
    sparks = "".join('<line x1="{:.1f}" y1="{:.1f}" x2="{:.1f}" y2="{:.1f}"/>'.format(*polar(150, contact_y, 13, a), *polar(150, contact_y, 28, a))
                     for a in (-42, 0, 42))
    spark = st(f"{p}sp", {"opacity": ["0", "0", "1"], "transform": ["scale(0.6)", "scale(0.6)", "scale(1)"]}, s, kf,
               MOVE + f" transform-origin: 150px {contact_y:.1f}px;")
    return svg(glasses + f'<g style="stroke: var(--g-acc); stroke-width: 2; stroke-linecap: round; {spark}">{sparks}</g>')


# ================================================================ 9 · DOTS (scattered → neat rows → a perfect circle)

ND = 28


def dot_layouts():
    """Each dot keeps its place in the clockwise order from twelve o'clock in every layout, so it travels roughly
    straight out to its spot on the ring instead of crossing the others."""
    rnd = random.Random(11)
    cols, rows, gap = 7, 4, 30
    grid = [(150 + (c - (cols - 1) / 2) * gap, 150 + (r - (rows - 1) / 2) * gap) for r in range(rows) for c in range(cols)]
    ring = [polar(150, 150, 112, k * 360 / ND) for k in range(ND)]
    scatter = [(rnd.uniform(16, 284), rnd.uniform(30, 270)) for _ in range(ND)]
    size = [rnd.uniform(0.55, 1.3) for _ in range(ND)]

    def clockwise(pts):
        return sorted(pts, key=lambda q: math.atan2(q[0] - 150, 150 - q[1]) % (2 * math.pi))
    return clockwise(grid), ring, clockwise(scatter), size


def dots_graphic(s, kf, p):
    rows, ring, scatter, size = dot_layouts()
    dots = ""
    for j in range(ND):
        at = st(f"{p}d{j}", {"transform": [f"translate({scatter[j][0]:.1f}px, {scatter[j][1]:.1f}px) scale({size[j]:.2f})",
                                           f"translate({rows[j][0]:.1f}px, {rows[j][1]:.1f}px) scale(1)",
                                           f"translate({ring[j][0]:.1f}px, {ring[j][1]:.1f}px) scale(1.15)"],
                             "fill": ["var(--muted)", "var(--fg)", "var(--g-acc)"]}, s, kf, MOVE + " transform-origin: 0 0;")
        dots += f'<circle cx="0" cy="0" r="4.4" style="{at}"/>'
    return svg(dots)


# ================================================================ 10 · TABLE CODE (the waiter's code, drawn flat)

FORK = ("M -10.5 -100 L -10.5 -68 M -3.5 -100 L -3.5 -66 M 3.5 -100 L 3.5 -66 M 10.5 -100 L 10.5 -68 "
        "M -10.5 -68 C -10.5 -52 -5 -46 0 -46 C 5 -46 10.5 -52 10.5 -68 M 0 -46 L 0 -26 "
        "M 0 -26 C -3 -6 -6.5 40 -6.5 84 C -6.5 99 6.5 99 6.5 84 C 6.5 40 3 -6 0 -26 Z")
KNIFE = ("M -4.5 -2 L -4.5 -86 C -4.5 -96 0 -101.5 3.5 -101 C 7 -100.5 7.2 -80 7 -50 L 6 -2 Z "
         "M -5.5 -2 L 5.5 -2 L 5.5 88 C 5.5 100 -5.5 100 -5.5 88 Z")


def table_graphic(s, kf, p):
    tips = (-math.sin(math.radians(60)), -math.cos(math.radians(60)))  # four o'clock: tips toward ten
    side = (-tips[1], tips[0])
    def four(k):
        return 150 - 12 * tips[0] + k * 13 * side[0], 150 - 12 * tips[1] + k * 13 * side[1]
    places = {
        "f": (FORK, [(118, 158, 24), (*four(-1), -60), (150, 134, -90)]),   # crossed · parallel at 4 · straight across
        "k": (KNIFE, [(182, 158, -24), (*four(1), -60), (150, 168, -90)]),
    }
    ware = ""
    for key, (d, pos) in places.items():
        at = st(f"{p}u{key}", {"transform": [f"translate({x:.1f}px, {y:.1f}px) rotate({r}deg)" for x, y, r in pos],
                               "stroke": ["var(--fg)", "var(--fg)", "var(--g-acc)"]}, s, kf, MOVE + " transform-origin: 0 0;")
        ware += f'<path d="{d}" style="fill: var(--card); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; {at}"/>'
    return svg('<circle cx="150" cy="150" r="140" style="fill: var(--card); stroke: var(--g-line); stroke-width: 1.5;"/>'
               '<circle cx="150" cy="150" r="100" style="fill: none; stroke: var(--g-line); stroke-width: 1.2;"/>' + ware)


# ================================================================ the canvas

NEW = [
    dict(pre="su", name="Sunrise", file="F5-Sunrise.dc.html", graphic=sunrise_graphic,
         short="A flat sun that barely shows, sits halfway, or rises full with fine rays.",
         sub="A flat sun on a thin horizon: it barely shows, sits halfway up, or rises full in burgundy with fine rays and a striped "
             "reflection, like an old travel poster."),
    dict(pre="di", name="Dial", file="F6-Dial.dc.html", graphic=dial_graphic,
         short="A thin gauge on your list&rsquo;s 0 to 10; the needle sweeps over as the ticks light up.",
         sub="A thin gauge read on your list&rsquo;s own 0 to 10: the needle rests at the low end, stands straight up, or sweeps all the "
             "way over while the ticks light up in burgundy behind it."),
    dict(pre="he", name="Heart", file="F7-Heart.dc.html", graphic=heart_graphic,
         short="An outline heart that fills with flat burgundy: a little, halfway, all the way.",
         sub="A thin outline heart that fills with flat burgundy from the bottom: a little, halfway, or all the way &mdash; and then a "
             "faint second outline appears around it."),
    dict(pre="ch", name="Cheers", file="F8-Cheers.dc.html", graphic=cheers_graphic,
         short="Two glasses stand apart, side by side, or lift and clink. Mesa&rsquo;s like is already Cheers.",
         sub="Two line-drawn wine glasses, since Mesa&rsquo;s like is already called Cheers: they stand apart, stand side by side, or "
             "lift and clink with three fine sparks."),
    dict(pre="do", name="Dots", file="F9-Dots.dc.html", graphic=dots_graphic,
         short="Scattered dots fall into neat rows, then settle into a perfect burgundy circle.",
         sub="Twenty-eight dots: scattered, then in neat rows, then settled into a perfect circle in burgundy &mdash; the night "
             "coming together."),
    dict(pre="tc", name="Table code", file="F10-Table.dc.html", graphic=table_graphic,
         short="Fork and knife placed the way waiters read them: crossed, at four o&rsquo;clock, straight across.",
         sub="The waiter&rsquo;s code, drawn flat on a white plate: fork and knife crossed means you didn&rsquo;t love it, parallel at "
             "four o&rsquo;clock means it was fine, laid straight across means you loved it."),
]
OLD_SHORT = {
    "Ring": "The dish as a plate; a thin burgundy ring fills a third, two-thirds, or all the way.",
    "Moon": "A flat moon: a thin crescent, half lit, or full with a faint halo.",
    "Line": "One line that droops, lies flat, or rises into a signature loop.",
    "Wave": "Thin sound bars: nearly silent, a gentle rhythm, or full energy.",
}
INK, CREAM, SOFT, ROSE = "#0b0809", "#f4ede2", "rgba(244,237,226,0.62)", "rgba(244,237,226,0.5)"
DELAY = "-4.9s"  # 49% into the 10-second cycle: the start page's phones open on Loved it


def mini(d, s, kf, scale):
    return R3.screen("Night", d, s, kf).replace(
        "width: 393px; height: 852px; border-radius: 54px;",
        f"width: 393px; height: 852px; border-radius: 54px; transform: scale({scale}); transform-origin: top left;", 1)


def main_page():
    w, h = 1680, 1250
    kf = {}
    big = ""
    for n, d in enumerate(NEW, 5):
        big += (f'<a href="{d["file"]}" class="tile" style="flex: 1; min-width: 0; border-radius: 30px; background: #171213; color: {CREAM}; '
                'padding: 20px 18px 22px; text-decoration: none; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;">'
                f'<span style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; color: {ROSE};">DIRECTION {n}</span>'
                f'<div class="offset" style="width: 197px; height: 426px; margin: 6px auto 10px;">{mini(d, None, kf, 0.5)}</div>'
                f'<span style="font-family: {SERIF}; font-size: 30px; line-height: 1;">{d["name"]}</span>'
                f'<span style="font-size: 13.5px; line-height: 1.45; color: {SOFT};">{d["short"]}</span></a>')
    small = ""
    for n, d in enumerate(R3.DIRS, 1):
        small += (f'<a href="{d["file"]}" class="tile" style="flex: 1; min-width: 0; border-radius: 26px; background: #171213; color: {CREAM}; '
                  'padding: 16px 20px 16px 16px; text-decoration: none; display: flex; gap: 18px; align-items: center; box-sizing: border-box;">'
                  f'<div style="width: 118px; height: 256px; flex-shrink: 0;">{mini(d, 2, kf, 0.3)}</div>'
                  '<div style="display: flex; flex-direction: column; gap: 8px; min-width: 0;">'
                  f'<span style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; color: {ROSE};">DIRECTION {n}</span>'
                  f'<span style="font-family: {SERIF}; font-size: 28px; line-height: 1;">{d["name"]}</span>'
                  f'<span style="font-size: 13.5px; line-height: 1.45; color: {SOFT};">{OLD_SHORT[d["name"]]}</span></div></a>')
    inner = (f'<div style="width: 100%; height: 100%; box-sizing: border-box; background: {INK}; color: {CREAM}; padding: 56px 64px; '
             'display: flex; flex-direction: column;">'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(244,237,226,0.5);">MESA &#183; HOW WAS IT? &#183; ROUND FOUR</div>'
             f'<div style="font-family: {SERIF}; font-size: 56px; line-height: 1; margin-top: 10px;">Six more, same family</div>'
             f'<p style="margin: 12px 0 26px; font-size: 16px; line-height: 1.5; color: {SOFT}; max-width: 1040px;">Flat shapes and thin lines on the '
             'app&rsquo;s own cream and black, with a bit of burgundy &mdash; no faces, no 3D, no shading. These phones play through the three '
             'answers by themselves; open one to see every answer in both themes. Last round&rsquo;s four are underneath, so all ten are in one place.</p>'
             f'<div style="display: flex; gap: 16px;">{big}</div>'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(244,237,226,0.5); margin: 40px 0 14px;">FROM LAST ROUND</div>'
             f'<div style="display: flex; gap: 16px;">{small}</div></div>')
    css = (R3.AMBIENT + f".offset * {{ animation-delay: {DELAY} !important; }}\n"
           ".tile { transition: transform 150ms ease; } .tile:hover { transform: translateY(-3px); }\n"
           f".tile:focus-visible {{ outline: 2px solid {CREAM}; outline-offset: 3px; }}\n"
           "@media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile:hover { transform: none; } }\n"
           + "\n".join(kf.values()))
    return "Main.dc.html", "Start here", w, h, R3.page("How was it, round four", w, h, inner, css)


def main():
    os.makedirs(OUT, exist_ok=True)
    mp = main_page()
    new = [R3.dir_board(n, d) for n, d in enumerate(NEW, 5)]
    old = [R3.dir_board(n, d) for n, d in enumerate(R3.DIRS, 1)]
    remap = json.load(open(os.path.join(HERE, "photos6.json")))
    boards = {mp[0]: {"x": 0, "y": 0, "w": mp[2], "h": mp[3], "title": "Start here", "is_interactive": True}}
    order = [mp[0]]
    notes = {"n0": {"kind": "title1", "maxW": mp[2], "text": "How was it? — ten flat options", "x": 0, "y": -300}}
    y = mp[3] + 420
    for gid, label, group, first in [("n1", "Six new · 5 to 10", new, 5), ("n2", "From last round · 1 to 4", old, 1)]:
        bw, bh = group[0][2], group[0][3]
        notes[gid] = {"kind": "title1", "maxW": 2 * bw + 80, "text": label, "x": 0, "y": y - 300}
        for i, (fname, title, w, h, _) in enumerate(group):
            boards[fname] = {"x": (i % 2) * (bw + 80), "y": y + (i // 2) * (bh + 120), "w": w, "h": h, "title": f"{first + i} · {title}"}
            order.append(fname)
        y += ((len(group) + 1) // 2) * (bh + 120) + 300
    for fname, _, _, _, html in [mp] + new + old:
        for a, b in remap.items():
            html = html.replace(a, b)
        with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
            f.write(html)
    canvas = {"v": 3, "attachments": {}, "boards": boards, "createdOnFiles": {"at": "2026-09-29T07:40:00Z", "v": 1}, "designSystems": [],
              "launch": {"file": "Main.dc.html", "view": "focused"}, "notes": notes, "order": order, "pages": [], "title": "Mesa Rating Flat 2"}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, indent=1, ensure_ascii=False)
    for fname, _, w, h, html in [mp] + new + old:
        print(f"{fname:20s} {w}x{h} {len(html) / 1024:6.0f} KB")


if __name__ == "__main__":
    main()
