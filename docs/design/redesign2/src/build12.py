#!/usr/bin/env python3
"""Mesa — "How was it?", round three: flat and grown-up. No characters, no 3D, no gradients or shadows; the app's own
Afternoon and Candlelit grounds with a bit of burgundy. Four directions — Ring, Moon, Line, Wave. Each board: a phone
that plays through the answers by itself, then the three answers at rest; Afternoon on top, Candlelit below."""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mesa_ui import GF, ICON, SERIF, THEMES_CSS, UI, img  # noqa: E402
from build11 import FRAMES, one_hot, st  # noqa: E402  (same 10-second cycle: didn't → fine → loved → fine)

OUT = os.path.join(HERE, "flat", "project")
INK, SAND, MUTED = "#2a1512", "#e8dfd2", "#6f5d50"
W = 313
WORDS = ["Didn&rsquo;t love it", "It was fine", "Loved it"]
RANGES = ["Places it between 0 and 3.3 on your list", "Places it between 3.4 and 6.6 on your list", "Places it between 6.7 and 10 on your list"]
MOVE = "transform-box: view-box;"
GVARS = """
.Day { --g-acc: #7a1a29; --g-lit: #7a1a29; --g-dark: #e6dccd; --g-line: rgba(22,17,15,0.13); }
.Night { --g-acc: #7a1a29; --g-lit: #f4ede2; --g-dark: #1c1718; --g-line: rgba(244,237,226,0.15); }
"""


# ================================================================ 1 · RING

R, C = 122, 2 * math.pi * 122


def ring_graphic(s, kf, p):
    fracs = [0.34, 0.67, 1.0]
    off = st(f"{p}off", {"stroke-dashoffset": [f"{C * (1 - f):.1f}px" for f in fracs]}, s, kf, MOVE + " transform-origin: 150px 150px; transform: rotate(-90deg);")
    dot = st(f"{p}dot", {"transform": [f"rotate({f * 360:.1f}deg)" for f in fracs]}, s, kf, MOVE + " transform-origin: 150px 150px;")
    plate = st(f"{p}plate", {"transform": ["rotate(-12deg)", "rotate(0deg)", "rotate(9deg)"], "filter": ["grayscale(0.75)", "grayscale(0.3)", "grayscale(0)"]}, s, kf)
    return ('<div style="position: absolute; top: 168px; left: 50%; width: 300px; height: 300px; margin-left: -150px;">'
            '<svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true" style="position: absolute; inset: 0; overflow: visible;">'
            f'<circle cx="150" cy="150" r="{R}" style="fill: none; stroke: var(--g-line); stroke-width: 5;"/>'
            f'<circle cx="150" cy="150" r="{R}" style="fill: none; stroke: var(--g-acc); stroke-width: 5; stroke-linecap: round; '
            f'stroke-dasharray: {C:.1f}px; {off}"/>'
            f'<g style="{dot}"><circle cx="150" cy="{150 - R}" r="8" style="fill: var(--g-acc); stroke: var(--bg); stroke-width: 3;"/></g></svg>'
            '<div style="position: absolute; left: 50px; top: 50px; width: 200px; height: 200px; border-radius: 50%; overflow: hidden;">'
            f'<div style="width: 100%; height: 100%; {plate}">{img("mofongo")}</div></div></div>')


# ================================================================ 2 · MOON

def moon_graphic(s, kf, p):
    shadow = st(f"{p}shadow", {"transform": ["translateX(-18px)", "translateX(-108px)", "translateX(-232px)"]}, s, kf, MOVE)
    halo = st(f"{p}halo", {"opacity": ["0", "0", "1"], "transform": ["scale(0.92)", "scale(0.92)", "scale(1)"]}, s, kf, MOVE + " transform-origin: 150px 150px;")
    stars = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" style="fill: var(--fg); opacity: 0.3;"/>'
                    for x, y, r in [(34, 52, 1.6), (262, 40, 1.3), (280, 196, 1.7), (22, 214, 1.2), (70, 280, 1.4), (238, 272, 1.1), (150, 8, 1.2)])
    return ('<div style="position: absolute; top: 168px; left: 50%; width: 300px; height: 300px; margin-left: -150px;">'
            '<svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true" style="overflow: visible;"><defs>'
            f'<clipPath id="mo{p}{s}"><circle cx="150" cy="150" r="108"/></clipPath></defs>{stars}'
            f'<g style="{halo}"><circle cx="150" cy="150" r="130" style="fill: none; stroke: var(--g-lit); stroke-opacity: 0.35; stroke-width: 1.2;"/>'
            '<circle cx="150" cy="150" r="148" style="fill: none; stroke: var(--g-lit); stroke-opacity: 0.14; stroke-width: 1;"/></g>'
            f'<g clip-path="url(#mo{p}{s})"><circle cx="150" cy="150" r="108" style="fill: var(--g-lit);"/>'
            f'<circle cx="150" cy="150" r="108" style="fill: var(--g-dark); {shadow}"/></g>'
            '<circle cx="150" cy="150" r="108" style="fill: none; stroke: var(--g-line); stroke-width: 1.5;"/></svg></div>')


# ================================================================ 3 · LINE (one continuous stroke)

LINE_PATHS = [
    "M 18 96 C 70 94 104 98 132 118 C 160 138 176 168 214 180 C 238 188 256 186 270 192",
    "M 18 150 C 64 140 100 160 150 150 S 236 140 282 150",
    "M 18 196 C 70 196 104 186 132 156 C 162 124 206 70 190 44 C 176 22 146 42 162 80 C 178 118 232 112 284 60",
]


def line_graphic(s, kf, p):
    paths = ""
    for j, d in enumerate(LINE_PATHS):
        style = st(f"{p}l{j}", {"stroke-dashoffset": ["0px" if k == j else "900px" for k in range(3)], "opacity": one_hot(j)}, s, kf)
        color = "var(--g-acc)" if j == 2 else "var(--fg)"
        paths += (f'<path d="{d}" style="fill: none; stroke: {color}; stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; '
                  f'stroke-dasharray: 900px; {style}"/>')
    return ('<div style="position: absolute; top: 178px; left: 50%; width: 300px; height: 260px; margin-left: -150px;">'
            f'<svg width="300" height="260" viewBox="0 0 300 260" aria-hidden="true" style="overflow: visible;">{paths}</svg></div>')


# ================================================================ 4 · WAVE (a quiet room → a gentle rhythm → the room is loud)

N = 30


def bar_heights(state):
    out = []
    for i in range(N):
        if state == 0:
            h = 4 + 3 * abs(math.sin(i * 1.7))
        elif state == 1:
            h = 14 + 30 * abs(math.sin(i * 0.42)) * (0.55 + 0.45 * abs(math.sin(i * 0.9)))
        else:
            h = 30 + 96 * abs(math.sin(i * 0.36 + 0.5)) * (0.5 + 0.5 * abs(math.sin(i * 1.25)))
        out.append(h)
    return out


def wave_graphic(s, kf, p):
    hs = [bar_heights(k) for k in range(3)]
    bars = ""
    x0, step, bw, HM = 22, 8.9, 4.6, 130
    for i in range(N):
        x = x0 + i * step
        grow = st(f"{p}b{i}", {"transform": [f"scaleY({hs[k][i] / HM:.3f})" for k in range(3)],
                               "fill": ["var(--muted)", "var(--fg)", "var(--g-acc)"]}, s, kf, MOVE + " transform-origin: 0 150px;")
        bars += (f'<g style="{grow}"><g class="pulse" style="{MOVE} transform-origin: 0 150px; animation-delay: -{(i * 0.17) % 1.6:.2f}s;">'
                 f'<rect x="{x:.1f}" y="{150 - HM / 2}" width="{bw}" height="{HM}" rx="{bw / 2}"/></g></g>')
    return ('<div style="position: absolute; top: 168px; left: 50%; width: 300px; height: 300px; margin-left: -150px;">'
            f'<svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true" style="overflow: visible;">{bars}</svg></div>')


# ================================================================ the screen

def words_block(s, kf, p):
    words = "".join(
        f'<div style="position: absolute; inset: 0; text-align: center; font-family: {SERIF}; font-size: 54px; line-height: 1; white-space: nowrap; '
        f'{st(f"{p}w{j}", {"opacity": one_hot(j), "transform": ["translateY(0px)" if k == j else "translateY(8px)" for k in range(3)]}, s, kf)}">{WORDS[j]}</div>'
        for j in range(3))
    ranges = "".join(
        f'<div style="position: absolute; inset: 0; text-align: center; font-size: 13.5px; color: var(--muted); '
        f'{st(f"{p}r{j}", {"opacity": one_hot(j)}, s, kf)}">{RANGES[j]}</div>' for j in range(3))
    return (f'<div style="position: absolute; top: 494px; left: 0; right: 0; height: 56px;">{words}</div>'
            f'<div style="position: absolute; top: 560px; left: 0; right: 0; height: 20px;">{ranges}</div>')


def slider(s, kf, p):
    K = 30
    knob = st(f"{p}knob", {"left": [f"{-K / 2}px", f"{W / 2 - K / 2}px", f"{W - K / 2}px"]}, s, kf)
    fill = st(f"{p}fill", {"width": ["0px", f"{W / 2}px", f"{W}px"]}, s, kf)
    labels = "".join(
        f'<span style="position: absolute; top: 0; {"left: -4px;" if j == 0 else "right: -4px;" if j == 2 else "left: 50%; transform: translateX(-50%);"} '
        f'font-size: 13.5px; font-weight: 600; white-space: nowrap; color: var(--fg); '
        f'{st(f"{p}lab{j}", {"opacity": ["1" if k == j else "0.38" for k in range(3)]}, s, kf)}">{WORDS[j]}</span>' for j in range(3))
    stops = "".join(f'<span style="position: absolute; left: {x - 3}px; top: {K / 2 - 3}px; width: 6px; height: 6px; border-radius: 50%; '
                    'background: var(--g-line);"></span>' for x in (0, W / 2, W))
    return (f'<div style="position: absolute; top: 616px; left: 50%; width: {W}px; margin-left: -{W / 2}px;">'
            f'<div style="position: relative; height: {K}px;">'
            f'<span style="position: absolute; left: 0; right: 0; top: {K / 2 - 2}px; height: 4px; border-radius: 2px; background: var(--g-line);"></span>'
            f'{stops}<span style="position: absolute; left: 0; top: {K / 2 - 2}px; height: 4px; border-radius: 2px; background: var(--g-acc); {fill}"></span>'
            f'<span style="position: absolute; top: 0; width: {K}px; height: {K}px; border-radius: 50%; background: var(--g-acc); '
            f'box-shadow: 0 0 0 4px var(--bg); {knob}"></span></div>'
            f'<div style="position: relative; height: 22px; margin-top: 14px;">{labels}</div></div>')


def screen(theme, d, s, kf):
    p = d["pre"] + theme[0]
    close = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
             f'{ICON["close"]}</svg>')
    top = ('<div style="position: absolute; top: 56px; left: 16px; right: 16px; display: flex; align-items: center; justify-content: space-between; z-index: 5;">'
           f'<span style="width: 42px; height: 42px; border-radius: 50%; background: var(--chip); color: var(--fg); display: flex; align-items: center; '
           f'justify-content: center; box-shadow: var(--lift);">{close}</span>'
           '<span style="display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px 0 6px; border-radius: 18px; background: var(--chip); '
           'box-shadow: var(--lift); font-size: 13.5px; font-weight: 600;">'
           f'<span style="width: 26px; height: 26px; border-radius: 50%; overflow: hidden; display: block;">{img("mofongo")}</span>Adrian Tropical</span>'
           '<span style="width: 42px;"></span></div>')
    q = f'<div style="position: absolute; top: 118px; left: 0; right: 0; text-align: center; font-family: {SERIF}; font-size: 30px; line-height: 1;">How was it?</div>'
    bar = ('<div style="position: absolute; left: 18px; right: 18px; bottom: 30px; height: 62px; border-radius: 31px; background: var(--chip); box-shadow: var(--lift); '
           'display: flex; align-items: center; padding: 0 6px 0 22px;"><span style="flex: 1; font-size: 15px; font-weight: 600;">Add a note</span>'
           '<span style="height: 50px; padding: 0 24px; border-radius: 25px; background: var(--solid); color: var(--on-solid); display: flex; align-items: center; '
           f'gap: 8px; font-size: 15.5px; font-weight: 650;">Next<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
           f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON["arrow"]}</svg></span></div>')
    return (f'<div class="{theme}{" demo" if s is None else ""}" style="width: 393px; height: 852px; border-radius: 54px; overflow: hidden; position: relative; '
            f'flex-shrink: 0; background: var(--bg); color: var(--fg); font-family: {UI}; -webkit-font-smoothing: antialiased; '
            'box-shadow: 0 0 0 6px #0d0b0b, 0 0 0 7.5px #34302f, 0 30px 60px rgba(40,20,10,0.22);">'
            '<div style="position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 112px; height: 33px; border-radius: 20px; '
            f'background: #000; z-index: 80;"></div>{top}{q}{d["graphic"](s, kf, p)}{words_block(s, kf, p)}{slider(s, kf, p)}{bar}</div>')


DIRS = [
    dict(pre="ri", name="Ring", file="F1-Ring.dc.html", graphic=ring_graphic,
         sub="The dish sits in a circle like a plate seen from above; a thin burgundy ring fills a third, two-thirds, or all the way round, and the plate turns with it."),
    dict(pre="mn", name="Moon", file="F2-Moon.dc.html", graphic=moon_graphic,
         sub="A flat moon: a thin crescent, half lit, or full with a faint halo. Quiet, and very night-out."),
    dict(pre="li", name="Line", file="F3-Line.dc.html", graphic=line_graphic,
         sub="One continuous hand-drawn line that droops, lies flat, or rises into a loop like a signature &mdash; it redraws itself as the answer changes."),
    dict(pre="wa", name="Wave", file="F4-Wave.dc.html", graphic=wave_graphic,
         sub="A room&rsquo;s sound as thin bars: nearly silent, a gentle rhythm, or full energy &mdash; always moving softly."),
]

AMBIENT = """
@keyframes pulse { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.72); } }
.pulse { animation: pulse 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .pulse, .demo, .demo * { animation: none !important; } }
"""


def page(title, w, h, inner, css):
    props = json.dumps({"$preview": {"width": w, "height": h}}, separators=(",", ":"))
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            f'<title>{title}</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'<link rel="stylesheet" href="{GF}">\n<style>\nbody {{ margin: 0; }}\n{THEMES_CSS}{GVARS}{css}\n</style>\n</helmet>\n'
            f'<div style="width: {w}px; height: {h}px; box-sizing: border-box; font-family: {UI}; font-synthesis: none;">\n{inner}\n</div>\n</x-dc>\n'
            f"<script type=\"text/x-dc\" data-dc-script data-props='{props}'>\n"
            "class Component extends DCLogic {\n  renderVals() { return {}; }\n}\n</script>\n</body>\n</html>\n")


def dir_board(n, d):
    kf = {}
    w = 128 + 4 * 393 + 3 * 44
    h = 56 + 148 + 34 + 852 + 40 + 852 + 64
    labels = ["Plays by itself", WORDS[0], WORDS[1], WORDS[2]]
    cols = "".join(
        f'<div style="display: flex; flex-direction: column; gap: 40px; width: 393px; flex-shrink: 0;">'
        f'<div style="height: 18px; margin-bottom: -24px; font-size: 16px; font-weight: 650; color: {INK};">{lab}</div>'
        + screen("Day", d, None if j == 0 else j - 1, kf) + screen("Night", d, None if j == 0 else j - 1, kf) + '</div>'
        for j, lab in enumerate(labels))
    head = ('<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; height: 112px; margin-bottom: 36px;">'
            f'<div><div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: {MUTED};">Direction {n}</div>'
            f'<div style="font-family: {SERIF}; font-size: 60px; line-height: 1; margin-top: 8px;">{d["name"]}</div>'
            f'<p style="margin: 10px 0 0; font-size: 17px; color: {MUTED}; max-width: 1100px;">{d["sub"]}</p></div>'
            f'<div style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: {MUTED}; text-align: right;">'
            f'<span>Top row &mdash; <b style="color: {INK};">Afternoon</b></span><span>Bottom row &mdash; <b style="color: {INK};">Candlelit</b></span></div></div>')
    inner = (f'<div style="width: 100%; height: 100%; box-sizing: border-box; background: {SAND}; color: {INK}; padding: 56px 64px 48px;">'
             + head + f'<div style="display: flex; gap: 44px; align-items: flex-start;">{cols}</div></div>')
    return d["file"], d["name"], w, h, page(f"Mesa &middot; {d['name']}", w, h, inner, AMBIENT + "\n".join(kf.values()))


def main_page():
    w, h = 1480, 960
    kf = {}
    tiles = ""
    for n, d in enumerate(DIRS, 1):
        mini = screen("Night", d, 2, kf).replace("width: 393px; height: 852px; border-radius: 54px;",
                                                 "width: 393px; height: 852px; border-radius: 54px; transform: scale(0.5); transform-origin: top left;", 1)
        tiles += (f'<a href="{d["file"]}" class="tile" style="flex: 1; min-width: 0; border-radius: 30px; background: #171213; color: #f4ede2; padding: 20px 20px 22px; '
                  'text-decoration: none; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;">'
                  f'<span style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; color: rgba(244,237,226,0.5);">DIRECTION {n}</span>'
                  f'<div style="width: 197px; height: 426px; margin: 6px auto 10px;">{mini}</div>'
                  f'<span style="font-family: {SERIF}; font-size: 30px; line-height: 1;">{d["name"]}</span>'
                  f'<span style="font-size: 13.5px; line-height: 1.45; color: rgba(244,237,226,0.62);">{d["sub"]}</span></a>')
    inner = ('<div style="width: 100%; height: 100%; box-sizing: border-box; background: #0b0809; color: #f4ede2; padding: 56px 64px; display: flex; flex-direction: column;">'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(244,237,226,0.5);">MESA &#183; HOW WAS IT? &#183; ROUND THREE</div>'
             f'<div style="font-family: {SERIF}; font-size: 56px; line-height: 1; margin-top: 10px;">Flat, quiet, grown-up</div>'
             '<p style="margin: 12px 0 26px; font-size: 16px; line-height: 1.5; color: rgba(244,237,226,0.66); max-width: 980px;">No faces, no 3D, no shading &mdash; '
             'thin lines and flat shapes on the app&rsquo;s own cream and black, with a bit of burgundy. Each board opens with a phone that plays through the three answers on its own.</p>'
             f'<div style="display: flex; gap: 16px;">{tiles}</div></div>')
    css = (AMBIENT + ".tile { transition: transform 150ms ease; } .tile:hover { transform: translateY(-3px); }\n"
           ".tile:focus-visible { outline: 2px solid #f4ede2; outline-offset: 3px; }\n"
           "@media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile:hover { transform: none; } }")
    return "Main.dc.html", "Start here", w, h, page("How was it, round three", w, h, inner, css)


def main():
    os.makedirs(OUT, exist_ok=True)
    mp = main_page()
    built = [dir_board(n, d) for n, d in enumerate(DIRS, 1)]
    remap_path = os.path.join(HERE, "photos5.json")
    remap = json.load(open(remap_path)) if os.path.exists(remap_path) else {}
    boards = {mp[0]: {"x": 0, "y": 0, "w": mp[2], "h": mp[3], "title": "Start here", "is_interactive": True}}
    order = [mp[0]]
    notes = {"n1": {"kind": "title1", "maxW": mp[2], "text": "How was it? — flat, quiet, grown-up", "w": 240, "x": 0, "y": -280}}
    y = mp[3] + 440
    for i, (fname, title, w, h, _) in enumerate(built):
        notes[f"t{i}"] = {"kind": "title1", "maxW": w, "text": f"Direction {i + 1} · {title}", "w": 240, "x": 0, "y": y - 280}
        boards[fname] = {"x": 0, "y": y, "w": w, "h": h, "title": title}
        order.append(fname)
        y += h + 440
    for fname, _, _, _, html in [mp] + built:
        for a, b in remap.items():
            html = html.replace(a, b)
        with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
            f.write(html)
    canvas = {"v": 3, "attachments": {}, "boards": boards, "createdOnFiles": {"at": "2026-09-29T05:30:00Z", "v": 1}, "designSystems": [],
              "launch": {"file": "Main.dc.html", "view": "focused"}, "notes": notes, "order": order, "pages": [], "title": "Mesa Rating Flat"}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, indent=1, ensure_ascii=False)
    for fname, _, w, h, html in [mp] + built:
        print(f"{fname:20s} {w}x{h} {len(html) / 1024:6.0f} KB")
    print("photos remapped:", bool(remap))


if __name__ == "__main__":
    main()
