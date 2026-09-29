"""Mesa redesign — the design system as HTML primitives (the founder's picks, 2026-09-28).

Picks: 01 Cream by day / black + a bit of burgundy by night (round 8) · 02 B greeting · 03 A pills ·
04 B one hero (round 8) ·
05 B friend cards · 06 A+C+D no-photo (their words > name card; map on place pages) ·
07 C number + word · 08 C active-circle tab bar · 09 B+C rank bar · 10 B icon, original oxblood ·
11 C podium. Every color is a CSS variable from the Day / Night classes, so one screen function
renders both themes.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build6 import GF, P, SERIF, UI  # noqa: E402,F401

OXBLOOD = "#210104"     # the app's Candlelit ground and the wordmark's ink — "the original burgundy"
BURGUNDY = "#7a1a29"    # the one accent, both themes — the "bit of burgundy" on black
CREAM = "#f1e8da"
PAPER = "#f5efe4"
ELL = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"

THEMES_CSS = """
.Day { --bg: #f3ede4; --card: #ffffff; --card2: #faf7f2; --sunk: #e9e1d5; --chip: #ffffff; --lift: 0 1px 2px rgba(60,40,20,0.07), 0 6px 18px rgba(60,40,20,0.05); --fg: #16110f; --fg2: #3d332d; --muted: #8a7a6c; --faint: #b9ab9c; --line: rgba(22,17,15,0.09); --glass: rgba(255,255,255,0.62); --glass-line: rgba(255,255,255,0.85); --glass-fg: #16110f; --solid: #16110f; --on-solid: #f4ede2; --accent: #7a1a29; --on-accent: #f4ede2; --accent-text: #7a1a29; --accent-soft: rgba(122,26,41,0.08); --bar-solid: #16110f; --sb-fg: rgba(244,237,226,0.55); --sb-act: #f4ede2; --gb-fg: rgba(22,17,15,0.5); --gb-act: #16110f; --switch: #7a1a29; --map: #ebe4d8; --map-road: #ffffff; --map-park: #dde0cb; --map-water: #d3dbdc; --scrim: rgba(22,17,15,0.3); --cat-cata: #7a1a29; --cat-musica: #7a1a29; --cat-brunch: #7a1a29; --cat-food: #7a1a29; --cat-happy: #7a1a29; --live: #7a1a29; --danger: #b3261e; --tab-act-bg: #16110f; --tab-act-fg: #f4ede2; --hglass: rgba(255,255,255,0.62); --hglass-line: rgba(255,255,255,0.85); --hglass-fg: #16110f; --hchip: rgba(255,255,255,0.8); }
.Night { --bg: #0b0809; --card: #171213; --card2: #1f191a; --sunk: #050404; --chip: rgba(255,255,255,0.08); --lift: none; --fg: #f4ede2; --fg2: #d9cfc2; --muted: rgba(244,237,226,0.55); --faint: rgba(244,237,226,0.32); --line: rgba(255,255,255,0.08); --glass: rgba(255,255,255,0.10); --glass-line: rgba(255,255,255,0.14); --glass-fg: #f4ede2; --solid: #f4ede2; --on-solid: #0b0809; --accent: #7a1a29; --on-accent: #f4ede2; --accent-text: #f4ede2; --accent-soft: rgba(122,26,41,0.28); --bar-solid: #1b1516; --sb-fg: rgba(244,237,226,0.5); --sb-act: #f4ede2; --gb-fg: rgba(244,237,226,0.55); --gb-act: #f4ede2; --switch: #7a1a29; --map: #141011; --map-road: #262021; --map-park: #171c15; --map-water: #0a0d10; --scrim: rgba(0,0,0,0.55); --cat-cata: #7a1a29; --cat-musica: #7a1a29; --cat-brunch: #7a1a29; --cat-food: #7a1a29; --cat-happy: #7a1a29; --live: #7a1a29; --danger: #ff6b5e; --tab-act-bg: #f4ede2; --tab-act-fg: #0b0809; --hglass: rgba(16,11,11,0.58); --hglass-line: rgba(255,255,255,0.12); --hglass-fg: #f4ede2; --hchip: rgba(255,255,255,0.1); }
"""

GL = ("background: var(--glass); -webkit-backdrop-filter: blur(22px) saturate(150%); "
      "backdrop-filter: blur(22px) saturate(150%); border: 1px solid var(--glass-line);")
# frosted panels on a photograph: white frost by day, smoked glass by night
HGL = ("background: var(--hglass); -webkit-backdrop-filter: blur(24px) saturate(140%); "
       "backdrop-filter: blur(24px) saturate(140%); border: 1px solid var(--hglass-line); color: var(--hglass-fg);")
# small controls on a photograph read the same in both themes (a photo is its own dark island)
PGL = ("background: rgba(20,6,6,0.32); -webkit-backdrop-filter: blur(22px) saturate(150%); "
       "backdrop-filter: blur(22px) saturate(150%); border: 1px solid rgba(255,255,255,0.18); color: #f5efe4;")

ICON = {
    "feed": '<path d="M7 3v4M9 3v18M11 3v4M16 3a2.5 2.5 0 0 0-2.5 2.5v3a1 1 0 0 0 1 1H16M16 3v18"/>',
    "explore": '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.3 13.3 8.5 15.5l2.2-4.8 4.8-2.2Z"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "rankings": '<path d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01"/>',
    "profile": '<path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/>',
    "bell": '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0"/>',
    "heart": '<path d="M12 20.5s-7.5-4.6-9.7-9A5.3 5.3 0 0 1 12 6.3 5.3 5.3 0 0 1 21.7 11.5c-2.2 4.4-9.7 9-9.7 9Z"/>',
    "comment": '<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z"/>',
    "bookmark": '<path d="M6 4h12v16l-6-4-6 4Z"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    "back": '<path d="M15 5l-7 7 7 7"/>',
    "chev_r": '<path d="M9 6l6 6-6 6"/>',
    "chev_d": '<path d="M6 9l6 6 6-6"/>',
    "close": '<path d="M6 6l12 12M18 6 6 18"/>',
    "share": '<path d="M7 17 17 7M8 7h9v9"/>',
    "more": '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
    "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "users": '<path d="M16 21a6 6 0 0 0-12 0M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM21 20a5 5 0 0 0-4-4.9M15.5 5.3a4 4 0 0 1 0 7.4"/>',
    "user_plus": '<path d="M15 20a6 6 0 0 0-12 0M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M16 11h6"/>',
    "sliders": '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    "sort": '<path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/>',
    "wine": '<path d="M8 3.5h8l-.4 5.5a3.6 3.6 0 0 1-7.2 0L8 3.5Z"/><path d="M12 12.6v7M8.8 19.6h6.4"/>',
    "pin": '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    "check": '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "star": '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z"/>',
    "trophy": '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4ZM7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/>',
    "phone": '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    "nav": '<path d="M3 11 21 3l-8 18-2-8-8-2Z"/>',
    "calendar": '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    "gear": '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/>',
    "menu": '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>',
    "pencil": '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/>',
    "camera": '<path d="M4 8h3l2-2.5h6L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>',
    "at": '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>',
    "lock": '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    "flag": '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    "map": '<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4ZM9 4v13.5M15 6.5V20"/>',
    "mail": '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
    "music": '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "moon": '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z"/>',
    "locate": '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>',
    "trash": '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    "block": '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    "list": '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    "image": '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
    "send": '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z"/>',
    "download": '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
    "flame": '<path d="M12 21a7 7 0 0 0 7-7c0-4-3-6-4-9-1 2.5-2.5 3.5-4 4 0-2-1-3.5-2-4.5C7 8 5 10.5 5 14a7 7 0 0 0 7 7Z"/>',
    "refresh": '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
}


def ic(name, size=20, sw=1.8, color="currentColor", fill="none"):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="{fill}" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0;">{ICON[name]}</svg>')


def img(photo, extra=""):
    return f'<img src="{P[photo]}" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block;{extra}">'


def scrim(stops="to top, rgba(20,4,4,0.85) 0%, rgba(20,4,4,0.3) 45%, rgba(20,4,4,0) 70%"):
    return f'<div style="position: absolute; inset: 0; background: linear-gradient({stops});"></div>'


# ---------------------------------------------------------------- people

TONES = ["#b5773c", "#c8703f", "#a98a63", "#8e5a45", "#9c6b52", "#b0835a"]


def avatar(letter, size=40, tone=0, ring=None):
    rg = f" box-shadow: 0 0 0 2px {ring};" if ring else ""
    return (f'<div style="width: {size}px; height: {size}px; border-radius: 50%; background: linear-gradient(145deg, {TONES[tone % 6]}, '
            f'#e8d5bd); color: #2a1512; display: flex; align-items: center; justify-content: center; font-family: {UI}; '
            f'font-weight: 600; font-size: {int(size * 0.42)}px; flex-shrink: 0;{rg}">{letter}</div>')


def stack(letters, size=24, ring="var(--bg)"):
    out = "".join(f'<div style="position: relative;{"" if i == 0 else f" margin-left: -{int(size * 0.32)}px;"}">'
                  f'{avatar(ch, size, i + 1, ring)}</div>' for i, ch in enumerate(letters))
    return f'<div style="display: flex;">{out}</div>'


# ---------------------------------------------------------------- score: number + word (pick 07 C)

def word(score):
    s = float(score)
    return "Must go" if s >= 9 else "Great" if s >= 8 else "Good" if s >= 7 else "Fine" if s >= 5 else "Skip"


def score_pill(score, kind="chip", size=17, show_word=True):
    """kind: chip (on a card), photo (glass on a photograph), solid (the one that matters most)."""
    look = {"chip": "background: var(--accent-soft); color: var(--fg);",
            "photo": PGL,
            "solid": "background: var(--solid); color: var(--on-solid);"}[kind]
    w = (f'<span style="font-family: {UI}; font-size: {max(11, int(size * 0.66))}px; font-weight: 650; letter-spacing: 0.01em;">'
         f'{word(score)}</span>') if show_word else ""
    h = int(size * 1.75)
    return (f'<span style="height: {h}px; padding: 0 {int(size * 0.6)}px; border-radius: {h // 2}px; {look} display: inline-flex; '
            f'align-items: center; gap: {int(size * 0.35)}px; white-space: nowrap; flex-shrink: 0; box-sizing: border-box;">'
            f'<span style="font-family: {SERIF}; font-size: {size + 3}px; line-height: 1; padding-top: 2px;">{score}</span>{w}</span>')


# ---------------------------------------------------------------- places without a photo (pick 06: A + C + D)

def name_card(name, size=64, radius=18, font=None):
    """A — the name set in the serif on a plain card. Used for thumbnails and tiles."""
    fs = font or max(11, int(size * 0.2))
    return (f'<div style="width: {size}px; height: {size}px; border-radius: {radius}px; background: var(--card2); '
            f'box-shadow: inset 0 0 0 1px var(--line); display: flex; align-items: center; justify-content: center; text-align: center; '
            f'font-family: {SERIF}; font-size: {fs}px; line-height: 1; color: var(--fg); padding: 6px; box-sizing: border-box; '
            f'overflow: hidden; flex-shrink: 0;">{name}</div>')


def map_svg(pin=True, dense=False):
    road = "fill: none; stroke: var(--map-road); stroke-linecap: round;"
    extra = ""
    if dense:
        extra = "".join(f'<path d="M{x} -10 L{x + 30} 410" style="{road} stroke-width: 3;"/>' for x in (20, 90, 170, 250, 330))
        extra += "".join(f'<path d="M-10 {y} L410 {y - 40}" style="{road} stroke-width: 3;"/>' for y in (60, 140, 230, 320))
    p = ('<g transform="translate(200 190)"><circle r="26" style="fill: var(--accent); opacity: 0.16;"/>'
         '<circle r="11" style="fill: var(--accent); stroke: var(--card); stroke-width: 4;"/></g>') if pin else ""
    return ('<svg width="100%" height="100%" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" '
            'style="position: absolute; inset: 0;">'
            '<rect width="400" height="400" style="fill: var(--map);"/>'
            '<path d="M-10 330 C 90 300, 160 350, 260 318 S 380 300, 410 310 L410 410 L-10 410 Z" style="fill: var(--map-water);"/>'
            '<rect x="238" y="210" width="90" height="62" rx="14" transform="rotate(-8 283 241)" style="fill: var(--map-park);"/>'
            + extra +
            f'<path d="M-10 120 L410 50" style="{road} stroke-width: 12;"/>'
            f'<path d="M-10 270 L410 210" style="{road} stroke-width: 8;"/>'
            f'<path d="M90 -10 L150 410" style="{road} stroke-width: 9;"/>'
            f'<path d="M290 -10 L330 410" style="{road} stroke-width: 5;"/>'
            f'<path d="M-10 190 L410 165" style="{road} stroke-width: 4;"/>' + p + '</svg>')


def thumb(photo, name="", size=64, radius=18):
    if photo:
        return (f'<div style="width: {size}px; height: {size}px; border-radius: {radius}px; overflow: hidden; flex-shrink: 0;">'
                f'{img(photo)}</div>')
    return name_card(name, size, radius)


# ---------------------------------------------------------------- controls

def btn(icon, size=44, kind="chip", label=None, stroke=1.9):
    look = {
        "chip": "background: var(--chip); color: var(--fg); box-shadow: var(--lift); border: 0;",
        "glass": GL + " color: var(--glass-fg);",
        "photo": PGL,
        "hero": HGL,
        "solid": "background: var(--solid); color: var(--on-solid); border: 0;",
        "accent": "background: var(--accent); color: var(--on-accent); border: 0;",
        "ghost": "background: transparent; color: var(--fg); border: 1px solid var(--line);",
    }[kind]
    return (f'<button type="button" aria-label="{label or icon}" style="width: {size}px; height: {size}px; border-radius: 50%; '
            f'{look} display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0;">'
            f'{ic(icon, int(size * 0.44), stroke)}</button>')


def cta(text, kind="solid", icon=None, h=54, grow=True, size=16):
    look = {"solid": "background: var(--solid); color: var(--on-solid); border: 0;",
            "accent": "background: var(--accent); color: var(--on-accent); border: 0;",
            "chip": "background: var(--chip); color: var(--fg); box-shadow: var(--lift); border: 0;",
            "ghost": "background: transparent; color: var(--fg); border: 1px solid var(--line);",
            "glass": GL + " color: var(--glass-fg);"}[kind]
    i = ic(icon, 18, 2) if icon else ""
    return (f'<button type="button" style="{"flex: 1; " if grow else ""}height: {h}px; padding: 0 20px; border-radius: {h // 2}px; {look} '
            f'display: flex; align-items: center; justify-content: center; gap: 8px; font-size: {size}px; font-weight: 650; '
            f'white-space: nowrap; box-sizing: border-box;">{i}{text}</button>')


def pill(text, active=False, icon=None, chevron=False, h=36):
    look = ("background: var(--solid); color: var(--on-solid);" if active
            else "background: var(--chip); color: var(--fg); box-shadow: var(--lift);")
    i = f'<span style="display: flex;">{ic(icon, 15, 1.9)}</span>' if icon else ""
    c = f'<span style="display: flex; opacity: 0.7;">{ic("chev_d", 14, 2)}</span>' if chevron else ""
    return (f'<span style="height: {h}px; padding: 0 {14 if chevron or icon else 15}px; border-radius: {h // 2}px; {look} font-size: 14px; '
            f'font-weight: 600; display: flex; align-items: center; gap: 6px; flex-shrink: 0; white-space: nowrap;">{i}{text}{c}</span>')


def pills(items, active=0, pad="0 20px", **kw):
    return (f'<div style="display: flex; gap: 8px; padding: {pad}; overflow: hidden;">'
            + "".join(pill(t, i == active, **kw) for i, t in enumerate(items)) + '</div>')


def switch(on=True):
    return (f'<span style="width: 51px; height: 31px; border-radius: 16px; background: {"var(--switch)" if on else "var(--sunk)"}; '
            'position: relative; flex-shrink: 0; display: block;">'
            f'<span style="position: absolute; top: 2px; {"right" if on else "left"}: 2px; width: 27px; height: 27px; border-radius: 50%; '
            'background: #ffffff; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"></span></span>')


def field(placeholder, value=None, icon=None, h=52, multiline=False):
    i = f'<span style="color: var(--muted); display: flex;">{ic(icon, 18, 1.9)}</span>' if icon else ""
    txt = (f'<span style="color: var(--fg);">{value}</span>' if value else f'<span style="color: var(--faint);">{placeholder}</span>')
    hh = f"min-height: {h}px; align-items: flex-start; padding-top: 16px;" if multiline else f"height: {h}px; align-items: center;"
    return (f'<div style="{hh} border-radius: 18px; background: var(--card); box-shadow: var(--lift); display: flex; gap: 10px; '
            f'padding-left: 16px; padding-right: 16px; box-sizing: border-box; font-size: 16px;">{i}{txt}</div>')


def search_bar(placeholder="Search", h=46):
    return (f'<div style="height: {h}px; border-radius: {h // 2}px; background: var(--chip); box-shadow: var(--lift); display: flex; '
            f'align-items: center; gap: 10px; padding: 0 16px; color: var(--muted); font-size: 16px;">{ic("search", 18, 2)}'
            f'<span style="{ELL}">{placeholder}</span></div>')


def eyebrow(text, color="var(--muted)"):
    return (f'<div style="font-size: 12.5px; font-weight: 650; letter-spacing: 0.02em; color: {color};">{text}</div>')


def section(title, right=None, pad="24px 20px 12px", size=21):
    r = f'<span style="font-size: 14px; color: var(--muted); font-weight: 500;">{right}</span>' if right else ""
    return (f'<div style="display: flex; align-items: baseline; justify-content: space-between; padding: {pad};">'
            f'<span style="font-size: {size}px; font-weight: 650; letter-spacing: -0.01em;">{title}</span>{r}</div>')


def top_nav(title=None, left="back", right=None, kind="chip", y=58):
    """Pushed-screen header: round back button, optional centered title, optional right buttons."""
    lb = btn(left, 42, kind, "Back") if left else '<span style="width: 42px;"></span>'
    rb = "".join(btn(r, 42, kind) for r in (right or []))
    t = (f'<span style="position: absolute; left: 70px; right: 70px; text-align: center; font-size: 16px; font-weight: 650; {ELL}">{title}</span>'
         if title else "")
    return (f'<div style="position: absolute; top: {y}px; left: 16px; right: 16px; height: 42px; display: flex; align-items: center; '
            f'justify-content: space-between; z-index: 30;">{lb}{t}<div style="display: flex; gap: 8px;">{rb or ""}</div></div>')


def large_title(title, sub=None, top=112, right=None, size=40):
    s = f'<div style="font-size: 14.5px; color: var(--muted); margin-top: 6px; line-height: 1.4;">{sub}</div>' if sub else ""
    r = f'<div style="display: flex; gap: 8px;">{right}</div>' if right else ""
    return (f'<div style="padding: {top}px 20px 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px;">'
            f'<div style="min-width: 0;"><div style="font-family: {SERIF}; font-size: {size}px; line-height: 1.02;">{title}</div>{s}</div>{r}</div>')


def group(rows, pad="0 16px"):
    """iOS inset-grouped list on a white/oxblood card. rows: list of html strings."""
    body = "".join(
        f'<div style="{"border-top: 1px solid var(--line); " if i else ""}margin-left: 16px; padding-right: 16px;">{r}</div>'
        for i, r in enumerate(rows))
    return (f'<div style="margin: {pad}; border-radius: 22px; background: var(--card); box-shadow: var(--lift); overflow: hidden;">'
            f'{body}</div>')


def row(label, value=None, icon=None, chevron=True, right=None, sub=None, h=54, color="var(--fg)"):
    i = f'<span style="color: var(--muted); display: flex; width: 24px;">{ic(icon, 20, 1.8)}</span>' if icon else ""
    v = f'<span style="color: var(--muted); font-size: 15px;">{value}</span>' if value else ""
    c = f'<span style="color: var(--faint); display: flex;">{ic("chev_r", 16, 2)}</span>' if chevron else ""
    s = f'<div style="font-size: 13px; color: var(--muted); margin-top: 2px; line-height: 1.35;">{sub}</div>' if sub else ""
    return (f'<div style="min-height: {h}px; display: flex; align-items: center; gap: 12px; padding: 10px 0; box-sizing: border-box;">{i}'
            f'<div style="flex: 1; min-width: 0;"><div style="font-size: 16px; color: {color};">{label}</div>{s}</div>'
            f'{v}{right or ""}{c}</div>')


def tabbar(active="feed", bottom=24):
    """Pick 08 C — glass capsule, the open tab sits in a filled circle, + in the accent."""
    def item(name):
        if name == active:
            return (f'<span style="width: 46px; height: 46px; border-radius: 50%; background: var(--tab-act-bg); color: var(--tab-act-fg); '
                    f'display: flex; align-items: center; justify-content: center;">{ic(name, 21, 1.9)}</span>')
        return (f'<span style="width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; '
                f'color: var(--gb-fg);">{ic(name, 22, 1.8)}</span>')
    plus = (f'<span style="width: 50px; height: 50px; border-radius: 50%; background: var(--accent); color: var(--on-accent); '
            f'display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(33,1,4,0.28);">{ic("plus", 22, 2.2)}</span>')
    return (f'<div style="position: absolute; left: 18px; right: 18px; bottom: {bottom}px; height: 66px; border-radius: 33px; {GL} '
            'display: flex; align-items: center; justify-content: space-around; padding: 0 8px; box-sizing: border-box; z-index: 40; '
            'box-shadow: 0 12px 30px rgba(33,1,4,0.18);">'
            + item("feed") + item("explore") + plus + item("rankings") + item("profile") + '</div>')


def rank_bar(label="Rank it", bottom=24, second="bookmark", third="nav"):
    """Pick 09 B+C, styled as the founder's favorite (Peperoni): black bar, burgundy Rank it, cream save, Directions."""
    return (f'<div style="position: absolute; left: 16px; right: 16px; bottom: {bottom}px; height: 70px; border-radius: 35px; '
            'background: var(--bar-solid); display: flex; align-items: center; gap: 8px; padding: 0 9px; z-index: 40; '
            'box-shadow: 0 12px 30px rgba(0,0,0,0.25);">'
            f'<span style="flex: 1; height: 52px; border-radius: 26px; background: var(--accent); color: var(--on-accent); display: flex; '
            f'align-items: center; justify-content: center; gap: 8px; font-size: 16px; font-weight: 650; white-space: nowrap;">{ic("plus", 18, 2.2)}{label}</span>'
            f'<span style="width: 52px; height: 52px; border-radius: 50%; background: var(--sb-act); color: var(--bar-solid); '
            f'display: flex; align-items: center; justify-content: center; flex-shrink: 0;">{ic(second, 21, 2)}</span>'
            f'<span style="height: 52px; padding: 0 17px; border-radius: 26px; background: rgba(244,237,226,0.12); color: var(--sb-act); '
            f'display: flex; align-items: center; gap: 7px; font-size: 14.5px; font-weight: 600; flex-shrink: 0;">{ic(third, 16, 2)}Directions</span></div>')


def sheet(inner, top=300, title=None, close=True, dim=True):
    """A bottom sheet over a dimmed screen (iOS page sheet)."""
    d = '<div style="position: absolute; inset: 0; background: var(--scrim); z-index: 50;"></div>' if dim else ""
    t = ""
    if title:
        t = ('<div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 18px 10px;">'
             f'<span style="width: 34px;"></span><span style="font-size: 17px; font-weight: 650;">{title}</span>'
             + (btn("close", 34, "chip", "Close") if close else '<span style="width: 34px;"></span>') + '</div>')
    return (d + f'<div style="position: absolute; left: 0; right: 0; top: {top}px; bottom: 0; border-radius: 34px 34px 0 0; '
            'background: var(--bg); z-index: 55; box-shadow: 0 -10px 40px rgba(0,0,0,0.18); overflow: hidden;">'
            '<div style="width: 38px; height: 5px; border-radius: 3px; background: var(--faint); margin: 8px auto 10px; opacity: 0.8;"></div>'
            + t + inner + '</div>')


def menu(items, checked=0, top=200, left=20, width=230, title=None):
    """iOS pull-down menu anchored to a chip (replaces the old centered SORT BY cards)."""
    t = (f'<div style="padding: 10px 16px 8px; font-size: 12.5px; color: var(--muted); border-bottom: 1px solid var(--line);">{title}</div>'
         if title else "")
    body = "".join(
        f'<div style="height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 16px; font-size: 16px; '
        f'{"border-top: 1px solid var(--line);" if i else ""}"><span style="width: 18px; display: flex;">'
        f'{ic("check", 16, 2.2) if i == checked else ""}</span>{it}</div>' for i, it in enumerate(items))
    return ('<div style="position: absolute; inset: 0; background: var(--scrim); opacity: 0.35; z-index: 50;"></div>'
            f'<div style="position: absolute; top: {top}px; left: {left}px; width: {width}px; border-radius: 16px; {GL} z-index: 55; '
            'box-shadow: 0 18px 50px rgba(0,0,0,0.22); overflow: hidden; color: var(--fg);">' + t + body + '</div>')


def toast(text, bottom=112, icon="check"):
    return (f'<div style="position: absolute; left: 24px; right: 24px; bottom: {bottom}px; min-height: 52px; border-radius: 26px; {GL} '
            'display: flex; align-items: center; gap: 10px; padding: 0 18px; z-index: 45; box-shadow: 0 10px 30px rgba(0,0,0,0.16); '
            f'font-size: 15px; font-weight: 550;"><span style="color: var(--fg); display: flex;">{ic(icon, 18, 2.2)}</span>{text}</div>')


def empty(title, body, action=None, top=40):
    a = f'<div style="margin-top: 18px; display: flex; justify-content: center;">{cta(action, "chip", grow=False, h=46, size=15)}</div>' if action else ""
    return (f'<div style="padding: {top}px 36px 0; text-align: center;">'
            f'<div style="font-family: {SERIF}; font-size: 26px; line-height: 1.1;">{title}</div>'
            f'<div style="font-size: 15px; line-height: 1.45; color: var(--muted); margin-top: 8px;">{body}</div>{a}</div>')


def card(inner, pad="16px", margin="0 16px", radius=24, extra=""):
    return (f'<div style="margin: {margin}; padding: {pad}; border-radius: {radius}px; background: var(--card); '
            f'box-shadow: var(--lift); box-sizing: border-box;{extra}">{inner}</div>')


def label(text):
    return f'<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding: 22px 20px 8px;">{text}</div>'


def ttext(name, sub=None, note=None, size=20):
    s = f'<div style="font-size: 13px; color: var(--muted); margin-top: 3px; {ELL}">{sub}</div>' if sub else ""
    n = f'<div style="font-size: 13.5px; color: var(--fg2); margin-top: 3px; {ELL}">{note}</div>' if note else ""
    return (f'<div style="flex: 1; min-width: 0;"><div style="font-family: {SERIF}; font-size: {size}px; line-height: 1.08; {ELL}">{name}</div>'
            f'{s}{n}</div>')
