#!/usr/bin/env python3
"""Mesa — "How was it?", round two: the whole screen reacts (the founder's reference), in Mesa's palette.
Four directions — Moods, Bloom, Big type, Jelly. Each board: one phone that loops through the three answers on its
own (CSS keyframes, so it moves without anyone dragging), then the three answers at rest.

Colors live in registered custom properties (--m-*) on the phone, so one keyframes rule re-colors everything."""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mesa_ui import GF, ICON, SERIF, UI, img  # noqa: E402

OUT = os.path.join(HERE, "moods", "project")
INK, SAND, MUTED = "#2a1512", "#e8dfd2", "#6f5d50"
W, T = 313, 56
WORDS = ["Didn&rsquo;t love it", "It was fine", "Loved it"]
RANGES = ["Places it between 0 and 3.3 on your list", "Places it between 3.4 and 6.6 on your list", "Places it between 6.7 and 10 on your list"]
FRAMES = [("0%, 12%", 0), ("18%, 32%", 1), ("38%, 60%", 2), ("66%, 80%", 1), ("86%, 100%", 0)]
DUR, EASE = "10s", "cubic-bezier(.6,0,.25,1)"
VARS = ["bg", "text", "soft", "track", "word", "line", "eyew", "pupil", "s1", "s2", "s3"]


def keyframes(name, props):
    body = " ".join(f"{sel} {{ " + " ".join(f"{p}: {v[i]};" for p, v in props.items()) + " }" for sel, i in FRAMES)
    return f"@keyframes {name} {{ {body} }}"


def st(name, props, s, kf, extra=""):
    """Static frame: the state's values inline. Demo frame (s is None): a keyframes rule cycling all three."""
    if s is None:
        kf[name] = keyframes(name, props)
        return f"{extra} animation: {name} {DUR} {EASE} infinite;".strip()
    return (extra + " " + " ".join(f"{p}: {v[s]};" for p, v in props.items())).strip()


def one_hot(i, on="1", off="0"):
    return [on if j == i else off for j in range(3)]


MOVE = "transform-box: view-box;"


# ================================================================ 1 · MOODS (the reference, Mesa colors)

MOODS_COLORS = {
    "bg": ["#211d1c", "#ece2d2", "#7a1a29"], "text": ["#efe6d8", "#2a1f1b", "#f6ebe3"],
    "soft": ["rgba(255,255,255,0.10)", "rgba(42,31,27,0.07)", "rgba(255,255,255,0.14)"],
    "track": ["rgba(255,255,255,0.16)", "rgba(42,31,27,0.14)", "rgba(255,255,255,0.24)"],
    "word": ["#39322f", "#dbcab0", "#973044"], "line": ["#d8cdbf", "#2a1f1b", "#f6ebe3"],
    "eyew": ["#d8cdbf", "#fbf7f0", "#f6ebe3"], "pupil": ["#1b1817", "#2a1f1b", "#3a0710"],
    "s1": ["#000", "#000", "#000"], "s2": ["#000", "#000", "#000"], "s3": ["#000", "#000", "#000"],
}


def moods_graphic(s, kf, p):
    def eye(cx, side):
        lid = st(f"{p}lid{side}", {"transform": ["translateY(4px)", "translateY(-20px)", "translateY(-66px)"]}, s, kf, MOVE)
        pupil = st(f"{p}pup{side}", {"transform": ["translate(0px, 12px) scale(0.86)", "translate(0px, 3px) scale(0.96)", "translate(0px, -7px) scale(1.12)"]},
                   s, kf, MOVE)
        return (f'<g transform="translate({cx} 112)">'
                '<circle r="40" style="fill: var(--m-eyew);"/>'
                f'<g clip-path="url(#eye{p}{side}{s})">'
                f'<g style="{pupil}"><circle r="21" style="fill: var(--m-pupil);"/><circle cx="-7" cy="-8" r="6" style="fill: var(--m-eyew);"/></g>'
                f'<g style="{lid}"><rect x="-48" y="-100" width="96" height="100" style="fill: var(--m-bg);"/>'
                '<path d="M -44 0 L 44 0" style="stroke: var(--m-line); stroke-width: 6; stroke-linecap: round;"/></g>'
                f'<g class="blink" style="{MOVE} transform: translateY(-66px);"><rect x="-48" y="-100" width="96" height="100" style="fill: var(--m-bg);"/>'
                '<path d="M -44 0 L 44 0" style="stroke: var(--m-line); stroke-width: 6; stroke-linecap: round;"/></g></g>'
                '<circle r="40" style="fill: none; stroke: var(--m-line); stroke-width: 6;"/></g>')

    def brow(cx, side, rots):
        tr = st(f"{p}brow{side}", {"transform": [f"translate({cx}px, 60px) rotate({rots[0]}deg)", f"translate({cx}px, 57px) rotate(0deg)",
                                                 f"translate({cx}px, 40px) rotate({rots[2]}deg)"]}, s, kf, MOVE)
        return (f'<g style="{tr}"><path d="M -30 5 Q 0 -11 30 5" style="fill: none; stroke: var(--m-line); stroke-width: 8; stroke-linecap: round;"/></g>')

    smile = st(f"{p}smile", {"opacity": one_hot(2), "transform": ["scale(0.6)", "scale(0.6)", "scale(1)"]}, s, kf, MOVE + " transform-origin: 150px 190px;")
    meh = st(f"{p}meh", {"opacity": one_hot(1)}, s, kf)
    frown = st(f"{p}frown", {"opacity": one_hot(0)}, s, kf)
    blush = st(f"{p}blush", {"opacity": ["0", "0", "0.9"]}, s, kf)
    return ('<div style="position: absolute; top: 176px; left: 0; right: 0; display: flex; justify-content: center;">'
            '<svg width="300" height="250" viewBox="0 0 300 250" aria-hidden="true" style="overflow: visible;"><defs>'
            f'<clipPath id="eye{p}L{s}"><circle r="40"/></clipPath><clipPath id="eye{p}R{s}"><circle r="40"/></clipPath></defs>'
            + eye(98, "L") + eye(202, "R") + brow(98, "L", (-16, 0, -5)) + brow(202, "R", (16, 0, 5)) +
            '<path d="M 150 140 q -8 12 2 19" style="fill: none; stroke: var(--m-line); stroke-width: 5; stroke-linecap: round;"/>'
            f'<g style="{blush}"><ellipse cx="62" cy="172" rx="19" ry="10" fill="#a8384d"/><ellipse cx="238" cy="172" rx="19" ry="10" fill="#a8384d"/></g>'
            f'<g style="{smile}"><path d="M 102 176 Q 150 242 198 176 Q 150 198 102 176 Z" style="fill: var(--m-pupil);"/>'
            '<path d="M 128 214 Q 150 198 172 214 Q 150 228 128 214 Z" fill="#c75a6e"/></g>'
            f'<g style="{meh}"><path d="M 120 198 Q 135 191 150 198 T 180 198" style="fill: none; stroke: var(--m-line); stroke-width: 7; stroke-linecap: round;"/></g>'
            f'<g style="{frown}"><path d="M 114 214 Q 150 182 186 214" style="fill: none; stroke: var(--m-line); stroke-width: 8; stroke-linecap: round;"/></g>'
            '</svg></div>')


# ================================================================ 2 · BLOOM (like the iPhone's mood logger)

BLOOM_COLORS = {
    "bg": ["#101011", "#16110f", "#1c0a0e"], "text": ["#e9e3dc", "#efe6d8", "#f6ebe3"],
    "soft": ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.09)", "rgba(255,255,255,0.11)"],
    "track": ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.16)", "rgba(255,255,255,0.2)"],
    "word": ["#2a2727", "#3a302a", "#5c1b28"], "line": ["#000", "#000", "#000"], "eyew": ["#000", "#000", "#000"],
    "pupil": ["#000", "#000", "#000"], "s1": ["#000", "#000", "#000"], "s2": ["#000", "#000", "#000"], "s3": ["#000", "#000", "#000"],
}


def polar_path(fn, cx=150, cy=150, n=240):
    pts = []
    for i in range(n):
        th = 2 * math.pi * i / n
        r = fn(th)
        pts.append(f"{cx + r * math.cos(th):.1f} {cy + r * math.sin(th):.1f}")
    return "M " + " L ".join(pts) + " Z"


FLOWER = polar_path(lambda t: 92 * (0.7 + 0.3 * math.cos(8 * t)))
FLOWER_IN = polar_path(lambda t: 58 * (0.74 + 0.26 * math.cos(8 * t + math.pi / 8)))
STAR = "M " + " L ".join(f"{150 + (80 if i % 2 == 0 else 46) * math.cos(math.pi * i / 14 - math.pi / 2):.1f} "
                         f"{150 + (80 if i % 2 == 0 else 46) * math.sin(math.pi * i / 14 - math.pi / 2):.1f}" for i in range(28)) + " Z"


def bloom_graphic(s, kf, p):
    grp = st(f"{p}grp", {"transform": ["rotate(-24deg) scale(0.78)", "rotate(0deg) scale(0.94)", "rotate(18deg) scale(1.1)"]},
             s, kf, MOVE + " transform-origin: 150px 150px;")
    glow = st(f"{p}glow", {"opacity": ["0", "0.28", "1"]}, s, kf)
    rings = st(f"{p}rings", {"opacity": ["0.25", "0.6", "1"], "transform": ["scale(0.8)", "scale(0.95)", "scale(1.08)"]},
               s, kf, MOVE + " transform-origin: 150px 150px;")
    return ('<div style="position: absolute; top: 160px; left: 0; right: 0; display: flex; justify-content: center;">'
            '<svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true" style="overflow: visible;"><defs>'
            f'<radialGradient id="bg{p}{s}"><stop offset="0%" stop-color="#c4465d" stop-opacity="0.6"/><stop offset="70%" stop-color="#7a1a29" stop-opacity="0"/></radialGradient>'
            f'<radialGradient id="fl{p}{s}" cx="50%" cy="40%" r="65%"><stop offset="0%" stop-color="#e98a9a"/><stop offset="45%" stop-color="#b8374f"/>'
            '<stop offset="100%" stop-color="#6e1624"/></radialGradient>'
            f'<radialGradient id="ci{p}{s}" cx="45%" cy="38%" r="65%"><stop offset="0%" stop-color="#f3e7d4"/><stop offset="100%" stop-color="#bfa98a"/></radialGradient>'
            f'<radialGradient id="kn{p}{s}" cx="45%" cy="38%" r="65%"><stop offset="0%" stop-color="#7d7371"/><stop offset="100%" stop-color="#3f3837"/></radialGradient>'
            '</defs>'
            f'<circle cx="150" cy="150" r="170" fill="url(#bg{p}{s})" style="{glow}"/>'
            f'<g style="{rings}"><circle cx="150" cy="150" r="118" fill="none" stroke="#ffffff" stroke-opacity="0.07"/>'
            '<circle cx="150" cy="150" r="138" fill="none" stroke="#ffffff" stroke-opacity="0.05"/></g>'
            f'<g style="{grp}">'
            f'<g style="{st(p + "star", {"opacity": one_hot(0)}, s, kf)}"><path d="{STAR}" fill="url(#kn{p}{s})"/></g>'
            f'<g style="{st(p + "circ", {"opacity": one_hot(1)}, s, kf)}"><circle class="breathe" cx="150" cy="150" r="84" fill="url(#ci{p}{s})" '
            f'style="{MOVE} transform-origin: 150px 150px;"/></g>'
            f'<g style="{st(p + "flow", {"opacity": one_hot(2)}, s, kf)}"><g class="spin" style="{MOVE} transform-origin: 150px 150px;">'
            f'<path d="{FLOWER}" fill="url(#fl{p}{s})"/><path d="{FLOWER_IN}" fill="#f0b3bd" fill-opacity="0.35"/>'
            '<circle cx="150" cy="150" r="16" fill="#fbe3e6" fill-opacity="0.75"/></g></g>'
            '</g></svg></div>')


# ================================================================ 3 · BIG TYPE (the answer is the picture)

BIGTYPE_COLORS = dict(MOODS_COLORS)
BIGTYPE_COLORS["word"] = ["#efe6d8", "#2a1f1b", "#f6ebe3"]
LINES = [["Didn&rsquo;t", "love it"], ["It was", "fine"], ["Loved", "it"]]
LOV = [(-18, -8), (6, 6), (-24, -4), (2, 9), (-12, -6), (10, 4), (-6, -3)]


def letters(line, mode, k0):
    chars = line.replace("&rsquo;", "’")
    n = len(chars)
    out = ""
    for i, ch in enumerate(chars):
        if ch == " ":
            out += '<span style="display: inline-block; width: 0.24em;"></span>'
            continue
        g = ch.replace("’", "&rsquo;")
        if mode == 2:
            dy, rot = LOV[(k0 + i) % len(LOV)]
            out += (f'<span style="display: inline-block; transform: translateY({dy}px) rotate({rot}deg);">'
                    f'<span class="bob" style="display: inline-block; animation-delay: -{(k0 + i) * 0.13:.2f}s;">{g}</span></span>')
        elif mode == 0:
            sag = 22 * math.sin(math.pi * (i + 0.5) / n)
            rot = (i - (n - 1) / 2) * 2.2
            if k0 > 0 and i == n - 1:
                sag, rot = 34, 22
            out += f'<span style="display: inline-block; transform: translateY({sag:.1f}px) rotate({rot:.1f}deg); opacity: 0.92;">{g}</span>'
        else:
            out += f'<span style="display: inline-block;">{g}</span>'
    return out


def bigtype_words(s, kf, p):
    blocks = ""
    for j in range(3):
        style = st(f"{p}w{j}", {"opacity": one_hot(j), "transform": ["translateY(0px)" if k == j else "translateY(18px)" for k in range(3)]}, s, kf)
        blocks += (f'<div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; {style}">'
                   f'<div style="font-family: {SERIF}; font-size: 104px; line-height: 0.95; color: var(--m-text); text-align: center; white-space: nowrap;">'
                   f'<div>{letters(LINES[j][0], j, 0)}</div><div>{letters(LINES[j][1], j, 7)}</div></div></div>')
    return f'<div style="position: absolute; top: 176px; left: 0; right: 0; height: 300px;">{blocks}</div>' + range_line(s, kf, p, 504)


# ================================================================ 4 · JELLY (a glossy blob that melts, sits, bounces)

JELLY_COLORS = {
    "bg": ["#d9d3cb", "#efe6d8", "#f3dfda"], "text": ["#3a3431", "#2a1f1b", "#3a0f18"],
    "soft": ["rgba(58,52,49,0.07)", "rgba(42,31,27,0.07)", "rgba(58,15,24,0.07)"],
    "track": ["rgba(58,52,49,0.16)", "rgba(42,31,27,0.14)", "rgba(58,15,24,0.16)"],
    "word": ["#c9c1b6", "#dccdb5", "#e9c7c3"], "line": ["#000", "#000", "#000"], "eyew": ["#000", "#000", "#000"], "pupil": ["#000", "#000", "#000"],
    "s1": ["#9a8b88", "#c24a5f", "#d8586f"], "s2": ["#6d5d5a", "#7a1a29", "#8c1d30"], "s3": ["#463b39", "#4a0c16", "#4c0a16"],
}
BLOB = "M 62 200 C 58 118 100 64 150 64 C 200 64 242 118 238 200 C 236 226 212 236 150 236 C 88 236 64 226 62 200 Z"
SPARK = "M0 -11 L2.6 -2.6 L11 0 L2.6 2.6 L0 11 L-2.6 2.6 L-11 0 L-2.6 -2.6 Z"


def jelly_graphic(s, kf, p):
    body = st(f"{p}body", {"transform": ["translate(0px, 34px) scale(1.24, 0.7)", "translate(0px, 0px) scale(1, 1)", "translate(0px, -18px) scale(0.93, 1.1)"]},
              s, kf, MOVE + " transform-origin: 150px 236px;")
    shadow = st(f"{p}shadow", {"transform": ["scale(1.35, 1)", "scale(1, 1)", "scale(0.78, 0.8)"], "opacity": ["0.2", "0.16", "0.1"]},
                s, kf, MOVE + " transform-origin: 150px 244px;")
    cream = "stroke: #fbf1e8; stroke-linecap: round; fill: none;"
    return ('<div style="position: absolute; top: 166px; left: 0; right: 0; display: flex; justify-content: center;">'
            '<svg width="300" height="270" viewBox="0 0 300 270" aria-hidden="true" style="overflow: visible;"><defs>'
            f'<radialGradient id="jb{p}{s}" cx="38%" cy="30%" r="80%"><stop offset="0%" style="stop-color: var(--m-s1);"/>'
            '<stop offset="55%" style="stop-color: var(--m-s2);"/><stop offset="100%" style="stop-color: var(--m-s3);"/></radialGradient></defs>'
            f'<g style="{shadow}"><ellipse cx="150" cy="244" rx="86" ry="11" fill="#1a0a06"/></g>'
            f'<g style="{body}"><g class="breathe" style="{MOVE} transform-origin: 150px 236px;">'
            f'<path d="{BLOB}" fill="url(#jb{p}{s})"/>'
            '<ellipse cx="112" cy="104" rx="26" ry="13" fill="#ffffff" fill-opacity="0.42" transform="rotate(-32 112 104)"/>'
            '<ellipse cx="200" cy="96" rx="7" ry="4" fill="#ffffff" fill-opacity="0.3" transform="rotate(-20 200 96)"/>'
            f'<g style="{st(p + "e2", {"opacity": one_hot(2)}, s, kf)}"><path d="M 110 154 Q 123 136 136 154" style="{cream} stroke-width: 7;"/>'
            f'<path d="M 164 154 Q 177 136 190 154" style="{cream} stroke-width: 7;"/>'
            '<path d="M 124 176 Q 150 210 176 176 Z" fill="#3a0710"/><path d="M 138 192 Q 150 184 162 192 Q 150 200 138 192 Z" fill="#d86a7e"/></g>'
            f'<g style="{st(p + "e1", {"opacity": one_hot(1)}, s, kf)}"><ellipse cx="123" cy="150" rx="9" ry="12" fill="#fbf1e8"/>'
            f'<ellipse cx="177" cy="150" rx="9" ry="12" fill="#fbf1e8"/><path d="M 138 184 L 162 184" style="{cream} stroke-width: 6;"/></g>'
            f'<g style="{st(p + "e0", {"opacity": one_hot(0)}, s, kf)}"><ellipse cx="123" cy="156" rx="9" ry="7" fill="#fbf1e8"/>'
            f'<ellipse cx="177" cy="156" rx="9" ry="7" fill="#fbf1e8"/><path d="M 110 151 L 136 143" style="{cream} stroke-width: 6;"/>'
            f'<path d="M 190 151 L 164 143" style="{cream} stroke-width: 6;"/><path d="M 134 192 Q 150 178 166 192" style="{cream} stroke-width: 6;"/></g>'
            '</g></g>'
            f'<g style="{st(p + "spark", {"opacity": ["0", "0", "1"]}, s, kf)}">'
            + "".join(f'<g transform="translate({x} {y}) scale({k})"><path class="twinkle" d="{SPARK}" fill="#7a1a29" style="{MOVE} transform-origin: 0 0; '
                      f'animation-delay: -{d}s;"/></g>' for x, y, k, d in [(56, 70, 1, 0), (246, 62, 0.8, 0.5), (262, 150, 0.6, 1.0), (40, 150, 0.55, 0.8)])
            + '</g></svg></div>')


# ================================================================ shared frame

def range_line(s, kf, p, top):
    return (f'<div style="position: absolute; top: {top}px; left: 0; right: 0; height: 20px;">' + "".join(
        f'<div style="position: absolute; inset: 0; text-align: center; font-size: 13.5px; color: var(--m-text); '
        f'{st(f"{p}r{j}", {"opacity": ["0.6" if k == j else "0" for k in range(3)]}, s, kf)}">{RANGES[j]}</div>' for j in range(3)) + '</div>')


def default_words(s, kf, p):
    blocks = "".join(
        f'<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: {SERIF}; font-size: 76px; '
        f'line-height: 1; color: var(--m-word); white-space: nowrap; '
        f'{st(f"{p}w{j}", {"opacity": one_hot(j), "transform": ["translateY(0px) scale(1)" if k == j else "translateY(14px) scale(0.96)" for k in range(3)]}, s, kf)}">'
        f'{WORDS[j]}</div>' for j in range(3))
    return f'<div style="position: absolute; top: 446px; left: 0; right: 0; height: 100px;">{blocks}</div>' + range_line(s, kf, p, 548)


MOUTHS = ["M6.5 16c1.5-2.4 3.4-3.6 5.5-3.6s4 1.2 5.5 3.6", "M7 13h10", "M6.5 11c1.5 2.4 3.4 3.6 5.5 3.6s4-1.2 5.5-3.6"]


def slider(s, kf, p):
    knob = st(f"{p}knob", {"left": [f"{-T / 2}px", f"{W / 2 - T / 2}px", f"{W - T / 2}px"]}, s, kf)
    glyphs = "".join(f'<path d="{MOUTHS[j]}" style="{st(f"{p}g{j}", {"opacity": one_hot(j)}, s, kf)}"/>' for j in range(3))
    labels = "".join(
        f'<span style="position: absolute; top: 0; {"left: -10px;" if j == 0 else "right: -10px;" if j == 2 else "left: 50%; transform: translateX(-50%);"} '
        f'font-size: 13.5px; font-weight: 650; white-space: nowrap; color: var(--m-text); '
        f'{st(f"{p}l{j}", {"opacity": ["1" if k == j else "0.42" for k in range(3)]}, s, kf)}">{WORDS[j]}</span>' for j in range(3))
    stops = "".join(f'<span style="position: absolute; left: {x - 5}px; top: {T / 2 - 5}px; width: 10px; height: 10px; border-radius: 50%; '
                    'background: var(--m-track);"></span>' for x in (0, W / 2, W))
    return (f'<div style="position: absolute; top: 606px; left: 50%; width: {W}px; margin-left: -{W / 2}px;">'
            f'<div style="position: relative; height: {T}px;"><span style="position: absolute; left: 0; right: 0; top: {T / 2 - 2}px; height: 4px; '
            f'border-radius: 2px; background: var(--m-track);"></span>{stops}'
            f'<span style="position: absolute; top: 0; width: {T}px; height: {T}px; border-radius: 50%; background: var(--m-text); color: var(--m-bg); '
            f'display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 24px rgba(0,0,0,0.22); {knob}">'
            f'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">{glyphs}</svg></span></div>'
            f'<div style="position: relative; height: 22px; margin-top: 12px;">{labels}</div></div>')


def mood_phone(d, s, kf):
    p = d["pre"]
    root = st(f"{p}colors", {f"--m-{k}": v for k, v in d["colors"].items()}, s, kf)
    close = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
             f'{ICON["close"]}</svg>')
    top = ('<div style="position: absolute; top: 56px; left: 16px; right: 16px; display: flex; align-items: center; justify-content: space-between; z-index: 5;">'
           f'<span style="width: 42px; height: 42px; border-radius: 50%; background: var(--m-soft); color: var(--m-text); display: flex; align-items: center; '
           f'justify-content: center;">{close}</span>'
           '<span style="display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px 0 6px; border-radius: 18px; background: var(--m-soft); '
           'color: var(--m-text); font-size: 13.5px; font-weight: 600;">'
           f'<span style="width: 26px; height: 26px; border-radius: 50%; overflow: hidden; display: block;">{img("mofongo")}</span>Adrian Tropical</span>'
           '<span style="width: 42px;"></span></div>')
    q = (f'<div style="position: absolute; top: 118px; left: 0; right: 0; text-align: center; font-family: {SERIF}; font-size: 30px; line-height: 1; '
         'color: var(--m-text);">How was it?</div>')
    bar = ('<div style="position: absolute; left: 18px; right: 18px; bottom: 30px; height: 62px; border-radius: 31px; background: var(--m-soft); display: flex; '
           'align-items: center; padding: 0 6px 0 22px;"><span style="flex: 1; font-size: 15px; font-weight: 600; color: var(--m-text);">Add a note</span>'
           '<span style="height: 50px; padding: 0 24px; border-radius: 25px; background: var(--m-text); color: var(--m-bg); display: flex; align-items: center; '
           f'gap: 8px; font-size: 15.5px; font-weight: 650;">Next<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
           f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON["arrow"]}</svg></span></div>')
    words = d["words"](s, kf, p) if d.get("words") else default_words(s, kf, p)
    graphic = d["graphic"](s, kf, p) if d.get("graphic") else ""
    cls = ' class="demo"' if s is None else ""
    return (f'<div{cls} style="width: 393px; height: 852px; border-radius: 54px; overflow: hidden; position: relative; flex-shrink: 0; '
            f'background: var(--m-bg); color: var(--m-text); font-family: {UI}; -webkit-font-smoothing: antialiased; '
            f'box-shadow: 0 0 0 6px #0d0b0b, 0 0 0 7.5px #34302f, 0 30px 60px rgba(40,20,10,0.22); {root}">'
            '<div style="position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 112px; height: 33px; border-radius: 20px; '
            f'background: #000; z-index: 80;"></div>{top}{q}{words}{graphic}{slider(s, kf, p)}{bar}</div>')


DIRS = [
    dict(key="moods", pre="mo", name="Moods", file="M1-Moods.dc.html", colors=MOODS_COLORS, graphic=moods_graphic,
         sub="Your reference, in Mesa colors: the whole screen turns charcoal, sand or burgundy, a face reacts, and the answer fills the background."),
    dict(key="bloom", pre="bl", name="Bloom", file="M2-Bloom.dc.html", colors=BLOOM_COLORS, graphic=bloom_graphic,
         sub="Like the iPhone&rsquo;s own mood logger: a shape tightens into a dull knot, relaxes into a circle, or opens into a glowing burgundy flower."),
    dict(key="type", pre="ty", name="Big type", file="M3-Big-type.dc.html", colors=BIGTYPE_COLORS, words=bigtype_words,
         sub="No picture &mdash; the answer is the picture. Its letters sag, sit straight, or jump, and the screen changes color with them."),
    dict(key="jelly", pre="je", name="Jelly", file="M4-Jelly.dc.html", colors=JELLY_COLORS, graphic=jelly_graphic,
         sub="A glossy burgundy blob that melts into a puddle, sits there, or stretches up and bounces."),
]

AMBIENT = """
@keyframes blink { 0%, 88%, 100% { transform: translateY(-66px); } 92% { transform: translateY(46px); } 96% { transform: translateY(-66px); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.025, 0.975); } }
@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
@keyframes twinkle { 0%, 100% { transform: scale(0.6) rotate(0deg); opacity: 0.4; } 50% { transform: scale(1.1) rotate(20deg); opacity: 1; } }
.blink { animation: blink 4.6s ease-in-out infinite; }
.spin { animation: spin 26s linear infinite; }
.breathe { animation: breathe 2.8s ease-in-out infinite; }
.bob { animation: bob 1.3s ease-in-out infinite; }
.twinkle { animation: twinkle 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .blink, .spin, .breathe, .bob, .twinkle { animation: none; } }
"""
PROPS = "".join(f"@property --m-{v} {{ syntax: '<color>'; inherits: true; initial-value: #000000; }}\n" for v in VARS)


def page(title, w, h, inner, css):
    props = json.dumps({"$preview": {"width": w, "height": h}}, separators=(",", ":"))
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            f'<title>{title}</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'<link rel="stylesheet" href="{GF}">\n<style>\nbody {{ margin: 0; }}\n{css}\n</style>\n</helmet>\n'
            f'<div style="width: {w}px; height: {h}px; box-sizing: border-box; font-family: {UI}; font-synthesis: none;">\n{inner}\n</div>\n</x-dc>\n'
            f"<script type=\"text/x-dc\" data-dc-script data-props='{props}'>\n"
            "class Component extends DCLogic {\n  renderVals() { return {}; }\n}\n</script>\n</body>\n</html>\n")


def dir_board(n, d):
    kf = {}
    w = 128 + 4 * 393 + 3 * 44
    h = 56 + 148 + 34 + 852 + 64
    labels = ["Plays by itself &mdash; watch it change", WORDS[0], WORDS[1], WORDS[2]]
    cols = "".join(
        f'<div style="display: flex; flex-direction: column; gap: 40px; width: 393px; flex-shrink: 0;">'
        f'<div style="height: 18px; margin-bottom: -24px; font-size: 16px; font-weight: 650; color: {INK};">{lab}</div>'
        f'{mood_phone(d, None if j == 0 else j - 1, kf)}</div>' for j, lab in enumerate(labels))
    head = ('<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; height: 112px; margin-bottom: 36px;">'
            f'<div><div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: {MUTED};">Direction {n}</div>'
            f'<div style="font-family: {SERIF}; font-size: 60px; line-height: 1; margin-top: 8px;">{d["name"]}</div>'
            f'<p style="margin: 10px 0 0; font-size: 17px; color: {MUTED}; max-width: 1100px;">{d["sub"]}</p></div></div>')
    inner = (f'<div style="width: 100%; height: 100%; box-sizing: border-box; background: {SAND}; color: {INK}; padding: 56px 64px 48px;">'
             + head + f'<div style="display: flex; gap: 44px; align-items: flex-start;">{cols}</div></div>')
    css = PROPS + AMBIENT + "\n".join(kf.values()) + "\n@media (prefers-reduced-motion: reduce) { .demo, .demo * { animation: none !important; } }"
    return d["file"], d["name"], w, h, page(f"Mesa &middot; {d['name']}", w, h, inner, css)


def main_page():
    w, h = 1480, 980
    kf = {}
    tiles = ""
    for n, d in enumerate(DIRS, 1):
        mini = mood_phone(d, 2, kf).replace("width: 393px; height: 852px; border-radius: 54px;", "width: 393px; height: 852px; border-radius: 54px; transform: scale(0.5); transform-origin: top left;")
        tiles += (f'<a href="{d["file"]}" class="tile" style="flex: 1; min-width: 0; border-radius: 30px; background: #171213; color: #f4ede2; padding: 20px 20px 22px; '
                  'text-decoration: none; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;">'
                  f'<span style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; color: #e07a8c;">DIRECTION {n}</span>'
                  f'<div style="width: 197px; height: 426px; margin: 6px auto 10px;">{mini}</div>'
                  f'<span style="font-family: {SERIF}; font-size: 30px; line-height: 1;">{d["name"]}</span>'
                  f'<span style="font-size: 13.5px; line-height: 1.45; color: rgba(244,237,226,0.62);">{d["sub"]}</span></a>')
    inner = ('<div style="width: 100%; height: 100%; box-sizing: border-box; background: #0b0809; color: #f4ede2; padding: 56px 64px; display: flex; flex-direction: column;">'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(244,237,226,0.5);">MESA &#183; HOW WAS IT? &#183; ROUND TWO</div>'
             f'<div style="font-family: {SERIF}; font-size: 56px; line-height: 1; margin-top: 10px;">The whole screen reacts</div>'
             '<p style="margin: 12px 0 26px; font-size: 16px; line-height: 1.5; color: rgba(244,237,226,0.66); max-width: 980px;">Four directions in Mesa&rsquo;s black, '
             'cream and burgundy. Each board opens with a phone that plays through the three answers on its own, then shows each answer at rest.</p>'
             f'<div style="display: flex; gap: 16px;">{tiles}</div></div>')
    css = (PROPS + AMBIENT + ".tile { transition: transform 150ms ease; } .tile:hover { transform: translateY(-3px); }\n"
           ".tile:focus-visible { outline: 2px solid #f4ede2; outline-offset: 3px; }\n"
           "@media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile:hover { transform: none; } }")
    return "Main.dc.html", "Start here", w, h, page("How was it, round two", w, h, inner, css)


def main():
    os.makedirs(OUT, exist_ok=True)
    mp = main_page()
    built = [dir_board(n, d) for n, d in enumerate(DIRS, 1)]
    remap_path = os.path.join(HERE, "photos4.json")
    remap = json.load(open(remap_path)) if os.path.exists(remap_path) else {}
    boards = {mp[0]: {"x": 0, "y": 0, "w": mp[2], "h": mp[3], "title": "Start here", "is_interactive": True}}
    order = [mp[0]]
    notes = {"n1": {"kind": "title1", "maxW": mp[2], "text": "How was it? — the whole screen reacts", "w": 240, "x": 0, "y": -280}}
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
    canvas = {"v": 3, "attachments": {}, "boards": boards, "createdOnFiles": {"at": "2026-09-29T04:30:00Z", "v": 1}, "designSystems": [],
              "launch": {"file": "Main.dc.html", "view": "focused"}, "notes": notes, "order": order, "pages": [], "title": "Mesa Rating Moods"}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, indent=1, ensure_ascii=False)
    for fname, _, w, h, html in [mp] + built:
        print(f"{fname:22s} {w}x{h} {len(html) / 1024:6.0f} KB")
    print("photos remapped:", bool(remap))


if __name__ == "__main__":
    main()
