#!/usr/bin/env python3
"""Mesa — three modern-iOS directions (Noir, Cream, Burgundy), three screens each.

Reference language (the founder's three screenshots): full-bleed photography, big continuous
corner radii, frosted-glass pills and panels, a floating capsule tab bar, round icon buttons,
large confident titles, one accent used sparingly. Mesa's palette: burgundy, cream, white, black.
Display: Instrument Serif, upright only. UI: the iOS system font (SF Pro on Apple devices).
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "project")

P = {
    "bar": "/_blob/414e9d96b0de7419bbd52a6e2b131470",
    "branzino": "/_blob/f849abdba270cbfa0e5f5c2e6eb4fb6b",
    "ceviche": "/_blob/a0bf0abb6007cc17c59e790e021033ce",
    "cocktails": "/_blob/63762f34aef6e081e4425b77090c6bcf",
    "dessert": "/_blob/fadee640d2220354d0299b30447bde86",
    "mofongo": "/_blob/ae54c43e0e23b94cc9b80a9958c20bd0",
    "pasta": "/_blob/c5dfc39b84f06923b4b3505a60677469",
    "pizza": "/_blob/c288501c3dff8ca7dc281be1cf3d7544",
    "steak": "/_blob/4cdefab769f4b467915fc43667f5d578",
    "tapas": "/_blob/9250253d082896a79eedb87fefeb4218",
    "wine": "/_blob/b4eebfdb91e3f5788876be2998cbdba5",
}

GF = ("https://fonts.googleapis.com/css2?family=Instrument+Serif"
      "&amp;family=Plus+Jakarta+Sans:wght@400..800&amp;display=swap")
UI = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Plus Jakarta Sans', system-ui, sans-serif"
SERIF = "'Instrument Serif', Georgia, serif"

CREAM = "#f4ede2"
BURG = "#7a1a29"        # accent burgundy — deep enough to read as wine, bright enough to find on black
BURG_DEEP = "#4a1219"

ICON = {
    "feed": '<path d="M7 3v4M9 3v18M11 3v4M16 3a2.5 2.5 0 0 0-2.5 2.5v3a1 1 0 0 0 1 1H16M16 3v18"/>',
    "explore": '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.3 13.3 8.5 15.5l2.2-4.8 4.8-2.2Z"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "rankings": '<path d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01"/>',
    "bell": '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0"/>',
    "heart": '<path d="M12 20.5s-7.5-4.6-9.7-9A5.3 5.3 0 0 1 12 6.3 5.3 5.3 0 0 1 21.7 11.5c-2.2 4.4-9.7 9-9.7 9Z"/>',
    "comment": '<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z"/>',
    "bookmark": '<path d="M6 4h12v16l-6-4-6 4Z"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    "back": '<path d="M15 5l-7 7 7 7"/>',
    "share": '<path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>',
    "more": '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "users": '<path d="M16 21a6 6 0 0 0-12 0M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM21 20a5 5 0 0 0-4-4.9M15.5 5.3a4 4 0 0 1 0 7.4"/>',
    "sliders": '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    "wine": '<path d="M8 3.5h8l-.4 5.5a3.6 3.6 0 0 1-7.2 0L8 3.5Z"/><path d="M12 12.6v7M8.8 19.6h6.4"/>',
    "pin": '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    "check": '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "star": '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z"/>',
    "trophy": '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4ZM7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/>',
}


def ic(name, size=20, sw=1.8, color="currentColor"):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[name]}</svg>')


def glass(mode):
    if mode == "light":
        return ("background: rgba(255,255,255,0.62); -webkit-backdrop-filter: blur(22px) saturate(160%); "
                "backdrop-filter: blur(22px) saturate(160%); border: 1px solid rgba(255,255,255,0.75);")
    if mode == "warm":
        return ("background: rgba(244,237,226,0.10); -webkit-backdrop-filter: blur(22px) saturate(150%); "
                "backdrop-filter: blur(22px) saturate(150%); border: 1px solid rgba(244,237,226,0.16);")
    return ("background: rgba(255,255,255,0.10); -webkit-backdrop-filter: blur(22px) saturate(150%); "
            "backdrop-filter: blur(22px) saturate(150%); border: 1px solid rgba(255,255,255,0.14);")


def circle_btn(icon, mode="dark", size=44, color=None, label=""):
    col = color or ("#1a1412" if mode == "light" else CREAM)
    return (f'<button type="button" aria-label="{label or icon}" style="width: {size}px; height: {size}px; border-radius: 50%; '
            f'{glass(mode)} color: {col}; display: flex; align-items: center; justify-content: center; padding: 0; '
            f'flex-shrink: 0;">{ic(icon, int(size * 0.44))}</button>')


def solid_btn(icon, bg, fg, size=44, label=""):
    return (f'<button type="button" aria-label="{label or icon}" style="width: {size}px; height: {size}px; border-radius: 50%; '
            f'background: {bg}; color: {fg}; border: 0; display: flex; align-items: center; justify-content: center; padding: 0; '
            f'flex-shrink: 0;">{ic(icon, int(size * 0.44), 2)}</button>')


def img(photo, style=""):
    return f'<img src="{P[photo]}" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block;{style}">'


TONES = ["#8a5a3c", "#6d2a33", "#a07852", "#3f4a3a", "#5b4a6e", "#b27a50"]


def avatar(letter, size=40, radius=None, tone=0, ring=None, text=CREAM):
    r = f"{radius}px" if radius is not None else "50%"
    rg = f" box-shadow: 0 0 0 2px {ring};" if ring else ""
    return (f'<div style="width: {size}px; height: {size}px; border-radius: {r}; background: {TONES[tone % len(TONES)]}; '
            f'color: {text}; display: flex; align-items: center; justify-content: center; font-family: {SERIF}; '
            f'font-size: {int(size * 0.46)}px; flex-shrink: 0;{rg}">{letter}</div>')


def stack(letters, size=24, ring="#0b0809"):
    out = ""
    for i, ltr in enumerate(letters):
        m = "" if i == 0 else f" margin-left: -{int(size * 0.32)}px;"
        out += f'<div style="position: relative;{m}">{avatar(ltr, size, tone=i + 1, ring=ring)}</div>'
    return f'<div style="display: flex;">{out}</div>'


def scrim(stops="to top, rgba(8,5,6,0.92) 0%, rgba(8,5,6,0.35) 45%, rgba(8,5,6,0) 70%"):
    return f'<div style="position: absolute; inset: 0; background: linear-gradient({stops});"></div>'


def phone(bg, fg, inner, overlay=""):
    return (f'<div style="width: 393px; height: 852px; border-radius: 56px; background: {bg}; color: {fg}; position: relative; '
            f'overflow: hidden; flex-shrink: 0; font-family: {UI}; -webkit-font-smoothing: antialiased; '
            'box-shadow: 0 0 0 7px #0c0c0d, 0 0 0 9px #2e2e31, 0 40px 80px rgba(0,0,0,0.35);">'
            '<div style="position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 112px; height: 33px; '
            'border-radius: 20px; background: #000; z-index: 60;"></div>'
            + inner + overlay + '</div>')


def tabbar(mode, bg_override=None, active_bg=None, active_fg=None, fab_bg=BURG, fab_fg=CREAM, fg=None):
    base = f"background: {bg_override};" if bg_override else glass(mode)
    muted = fg or ("rgba(26,20,18,0.55)" if mode == "light" else "rgba(244,237,226,0.6)")
    act = active_fg or ("#1a1412" if mode == "light" else CREAM)

    def item(icon, active=False):
        if active and active_bg:
            return (f'<span style="width: 46px; height: 46px; border-radius: 50%; background: {active_bg}; color: {act}; '
                    f'display: flex; align-items: center; justify-content: center;">{ic(icon, 21, 1.9)}</span>')
        dot = (f'<span style="position: absolute; bottom: -9px; left: 50%; width: 4px; height: 4px; border-radius: 50%; '
               f'transform: translateX(-50%); background: {act};"></span>') if active else ""
        return (f'<span style="position: relative; color: {act if active else muted}; display: flex; align-items: center; '
                f'justify-content: center; width: 44px; height: 44px;">{ic(icon, 22, 1.8)}{dot}</span>')
    fab = (f'<span style="width: 50px; height: 50px; border-radius: 50%; background: {fab_bg}; color: {fab_fg}; display: flex; '
           f'align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(0,0,0,0.3);">{ic("plus", 22, 2.2)}</span>')
    me = avatar("E", 30, tone=0, ring=("rgba(26,20,18,0.25)" if mode == "light" else "rgba(244,237,226,0.35)"))
    return (f'<div style="position: absolute; left: 18px; right: 18px; bottom: 24px; height: 68px; border-radius: 34px; {base} '
            'display: flex; align-items: center; justify-content: space-around; padding: 0 10px; z-index: 40; '
            'box-shadow: 0 12px 30px rgba(0,0,0,0.28);">'
            + item("feed", True) + item("explore") + fab + item("rankings") +
            f'<span style="display: flex; width: 44px; justify-content: center;">{me}</span></div>')


def label(strong, soft, right=None, color_soft="rgba(244,237,226,0.5)", pad="0 20px 12px", size=18):
    r = f'<span style="font-size: 14px; color: {color_soft};">{right}</span>' if right else ""
    return (f'<div style="display: flex; align-items: baseline; justify-content: space-between; padding: {pad};">'
            f'<span style="font-size: {size}px; font-weight: 600; letter-spacing: -0.01em;">{strong} '
            f'<span style="font-weight: 400; color: {color_soft};">{soft}</span></span>{r}</div>')


# ================================================================ A · NOIR

def a_feed():
    bg = "#0b0809"
    friends = "".join(
        f'<div style="position: relative; flex-shrink: 0;">{avatar(l, 62, 20, tone=i)}'
        '<span style="position: absolute; right: -2px; bottom: -2px; width: 14px; height: 14px; border-radius: 50%; '
        f'background: #34c759; box-shadow: 0 0 0 3px {bg};"></span></div>'
        for i, l in enumerate("RGCAMV"))

    def tonight_card(photo, place, sub, title, going, letters, w=270):
        return (f'<div style="width: {w}px; height: 340px; border-radius: 34px; overflow: hidden; position: relative; flex-shrink: 0;">'
                + img(photo) + scrim() +
                f'<div style="position: absolute; top: 12px; left: 12px; right: 12px; height: 54px; border-radius: 27px; {glass("dark")} '
                'display: flex; align-items: center; gap: 10px; padding: 0 8px 0 8px; box-sizing: border-box;">'
                + avatar(place[0], 38, tone=1) +
                f'<div style="flex: 1; min-width: 0;"><div style="font-size: 15px; font-weight: 600; color: {CREAM};">{place}</div>'
                f'<div style="font-size: 11px; color: rgba(244,237,226,0.6); letter-spacing: 0.02em;">{sub}</div></div>'
                f'<span style="height: 32px; padding: 0 14px; border-radius: 16px; {glass("dark")} color: {CREAM}; font-size: 13px; '
                'font-weight: 600; display: flex; align-items: center;">Save</span></div>'
                '<div style="position: absolute; left: 20px; right: 20px; bottom: 20px;">'
                f'<div style="font-family: {SERIF}; font-size: 40px; line-height: 0.96; color: {CREAM};">{title}</div>'
                '<div style="display: flex; align-items: center; gap: 10px; margin-top: 14px;">'
                f'<span style="height: 28px; padding: 0 12px; border-radius: 14px; background: {BURG}; color: {CREAM}; font-size: 12px; '
                'font-weight: 700; letter-spacing: 0.06em; display: flex; align-items: center;">TONIGHT</span>'
                f'<span style="font-size: 13px; color: rgba(244,237,226,0.75);">&#183; {going}</span>'
                f'<span style="margin-left: auto;">{stack(letters, 26, ring="#1a1010")}</span></div></div></div>')

    def friend_row(photo, score, name, sub):
        return ('<div style="display: flex; align-items: center; gap: 14px; padding: 0 20px 16px;">'
                '<div style="position: relative; width: 64px; height: 64px; border-radius: 20px; overflow: hidden; flex-shrink: 0;">'
                + img(photo) +
                f'<span style="position: absolute; left: 5px; top: 5px; height: 22px; padding: 0 7px; border-radius: 11px; {glass("dark")} '
                f'color: {CREAM}; font-size: 12px; font-weight: 700; display: flex; align-items: center;">{score}</span></div>'
                f'<div style="flex: 1; min-width: 0;"><div style="font-family: {SERIF}; font-size: 23px; line-height: 1.05; color: {CREAM};">{name}</div>'
                f'<div style="font-size: 13px; color: rgba(244,237,226,0.55); margin-top: 3px;">{sub}</div></div>'
                f'<span style="color: rgba(244,237,226,0.5);">{ic("heart", 22)}</span></div>')

    inner = ('<div style="height: 62px;"></div>'
             '<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 20px 20px;">'
             f'<span style="font-family: {SERIF}; font-size: 34px; line-height: 1; color: {CREAM};">Mesa</span>'
             f'<div style="display: flex; gap: 10px; align-items: center;">{circle_btn("bell", "dark", 46, label="Activity")}'
             f'{avatar("E", 46, 16, tone=0)}</div></div>'
             + label("Friends", "out tonight") +
             f'<div style="display: flex; gap: 14px; padding: 0 20px 26px; overflow: hidden;">{friends}</div>'
             + label("Tonight", "near you", "See all") +
             '<div style="display: flex; gap: 14px; padding: 0 20px 28px; overflow: hidden;">'
             + tonight_card("cocktails", "Samurai", "PIANTINI &#183; OMAKASE", "Aniversario<br>Omakase", "7 PM", "RGC")
             + tonight_card("tapas", "Lul&uacute; Tasting Bar", "ZONA COLONIAL &#183; TAPAS", "Men&uacute;<br>degustaci&oacute;n", "8 PM", "AG")
             + '</div>'
             + label("From", "your friends")
             + friend_row("steak", "9.6", "El Mes&oacute;n de la Cava", "Rafael &#183; Steakhouse &#183; 5w")
             + friend_row("pasta", "8.0", "Peperoni", "Enrique &#183; Italian &#183; 2w"))
    return phone(bg, CREAM, inner, tabbar("dark"))


def a_place():
    bg = "#0b0809"
    tile = lambda v, l: (f'<div style="flex: 1; border-radius: 24px; background: #171213; border: 1px solid rgba(255,255,255,0.06); '
                         'padding: 14px 14px 12px;">'
                         f'<div style="font-family: {SERIF}; font-size: 32px; line-height: 1; color: {CREAM};">{v}</div>'
                         f'<div style="font-size: 12px; color: rgba(244,237,226,0.55); margin-top: 6px;">{l}</div></div>')
    chip = lambda t: (f'<span style="height: 28px; padding: 0 12px; border-radius: 14px; {glass("dark")} color: {CREAM}; '
                      f'font-size: 12px; font-weight: 600; display: flex; align-items: center;">{t}</span>')
    inner = ('<div style="position: relative; height: 486px;">' + img("steak")
             + scrim("to top, rgba(11,8,9,1) 0%, rgba(11,8,9,0.55) 32%, rgba(11,8,9,0) 60%, rgba(11,8,9,0.45) 100%") +
             '<div style="position: absolute; top: 60px; left: 18px; right: 18px; display: flex; justify-content: space-between;">'
             + circle_btn("back", "dark", 44, label="Back") +
             f'<div style="display: flex; gap: 10px;">{circle_btn("share", "dark", 44, label="Share")}{circle_btn("bookmark", "dark", 44, label="Save")}</div></div>'
             '<div style="position: absolute; left: 20px; right: 20px; bottom: 16px;">'
             f'<div style="display: flex; gap: 6px; margin-bottom: 12px;">{chip("Steakhouse")}{chip("Serrall&eacute;s")}{chip("$$$$")}</div>'
             f'<div style="font-family: {SERIF}; font-size: 48px; line-height: 0.95; color: {CREAM};">El Mes&oacute;n<br>de la Cava</div></div></div>'
             '<div style="display: flex; gap: 10px; padding: 14px 18px 22px;">'
             + tile("9.6", "Mesa score") + tile("14", "Friends ranked") + tile("1 AM", "Open until") + '</div>'
             + label("Friends", "say", None, pad="0 20px 12px") +
             '<div style="display: flex; gap: 12px; padding: 0 20px;">' + avatar("R", 38, tone=0) +
             f'<div><div style="font-size: 15px; line-height: 1.4; color: {CREAM};">&ldquo;Mi spot de siempre. Pide el cordero.&rdquo;</div>'
             '<div style="font-size: 12.5px; color: rgba(244,237,226,0.55); margin-top: 4px;">Rafael &#183; 9.6 &#183; 5 weeks ago</div></div></div>')
    slide = ('<div style="position: absolute; left: 18px; right: 18px; bottom: 28px; height: 68px; border-radius: 34px; '
             'background: #1b1516; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; padding: 0 8px; z-index: 40;">'
             + solid_btn("check", BURG, CREAM, 52, "Rank") +
             f'<span style="flex: 1; text-align: center; font-size: 16px; font-weight: 600; color: {CREAM};">Rank this place</span>'
             '<span style="padding-right: 18px; font-size: 18px; letter-spacing: 2px; color: rgba(244,237,226,0.35);">&#8250;&#8250;&#8250;</span></div>')
    return phone(bg, CREAM, inner, slide)


def a_profile():
    tag = lambda t: (f'<span style="height: 30px; padding: 0 12px; border-radius: 15px; {glass("dark")} color: rgba(244,237,226,0.85); '
                     f'font-size: 13px; display: flex; align-items: center;">{t}</span>')
    top3 = "".join(
        f'<div style="position: relative; width: 72px; height: 72px; border-radius: 20px; overflow: hidden; flex-shrink: 0;">{img(p)}'
        f'<span style="position: absolute; left: 6px; top: 6px; width: 24px; height: 24px; border-radius: 50%; {glass("dark")} '
        f'color: {CREAM}; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;">{n}</span></div>'
        for n, p in enumerate(["steak", "ceviche", "wine", "pasta"], 1))
    stat = lambda v, l: (f'<div><div style="font-family: {SERIF}; font-size: 36px; line-height: 1; color: {CREAM};">{v}</div>'
                         f'<div style="font-size: 13px; color: rgba(244,237,226,0.55); margin-top: 4px;">{l}</div></div>')
    inner = ('<div style="position: absolute; inset: 0;">' + img("bar") + '</div>'
             '<div style="position: absolute; inset: 0; background: rgba(11,8,9,0.35);"></div>'
             '<div style="position: absolute; top: 60px; left: 18px; right: 18px; display: flex; align-items: center; '
             'justify-content: space-between; z-index: 3;">' + circle_btn("back", "dark", 42, label="Back") +
             f'<span style="font-size: 16px; font-weight: 600; color: {CREAM};">@enriquehdz</span>'
             f'<span style="height: 38px; padding: 0 16px; border-radius: 19px; background: {CREAM}; color: #1a1412; font-size: 14px; '
             'font-weight: 600; display: flex; align-items: center;">Edit profile</span></div>'
             '<div style="position: absolute; left: 12px; right: 12px; top: 122px; bottom: 16px; border-radius: 40px; '
             'background: rgba(18,12,13,0.55); -webkit-backdrop-filter: blur(28px) saturate(140%); backdrop-filter: blur(28px) saturate(140%); '
             'border: 1px solid rgba(255,255,255,0.12); padding: 16px 22px 20px; box-sizing: border-box; overflow: hidden;">'
             '<div style="width: 40px; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.4); margin: 0 auto 16px;"></div>'
             f'<div style="font-family: {SERIF}; font-size: 54px; line-height: 0.92; color: {CREAM};">Enrique<br>Hern&aacute;ndez</div>'
             '<div style="font-size: 14px; color: rgba(244,237,226,0.55); margin-top: 8px;">@enriquehdz &#183; Piantini</div>'
             f'<div style="font-size: 15px; line-height: 1.4; color: rgba(244,237,226,0.85); margin-top: 12px;">Rankeando Santo Domingo, un plato a la vez.</div>'
             '<div style="display: flex; gap: 34px; margin-top: 18px;">' + stat("92", "Ranked") + stat("22", "Followers") + stat("33", "Following") + '</div>'
             '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px;">'
             + tag("Piantini") + tag("Naco") + tag("Italian") + tag("Wine bars") + tag("Omakase") + '</div>'
             f'<div style="font-size: 17px; font-weight: 600; color: {CREAM}; margin: 20px 0 10px;">Top 4</div>'
             f'<div style="display: flex; gap: 10px;">{top3}</div>'
             '<div style="display: flex; gap: 12px; margin-top: 22px; align-items: flex-start;">' + avatar("G", 42, tone=1) +
             f'<div><div style="font-size: 14.5px; line-height: 1.4; color: {CREAM};">Your El Mes&oacute;n rec was perfect &mdash; gracias.</div>'
             '<div style="font-size: 12.5px; color: rgba(244,237,226,0.55); margin-top: 4px;">Grecia &#183; @greciaeats</div></div></div></div>')
    return phone("#0b0809", CREAM, inner)


# ================================================================ B · CREAM

def b_feed():
    ink = "#16110f"

    def card(photo, h, name, sub, score):
        return (f'<div style="height: {h}px; border-radius: 28px; overflow: hidden; position: relative; flex-shrink: 0;">'
                + img(photo) + scrim("to top, rgba(12,8,7,0.8) 0%, rgba(12,8,7,0) 55%") +
                f'<span style="position: absolute; top: 10px; right: 10px; height: 26px; padding: 0 9px; border-radius: 13px; {glass("light")} '
                f'color: {ink}; font-size: 12px; font-weight: 700; display: flex; align-items: center;">{score}</span>'
                '<div style="position: absolute; left: 14px; right: 14px; bottom: 13px;">'
                f'<div style="font-family: {SERIF}; font-size: 23px; line-height: 1; color: {CREAM};">{name}</div>'
                f'<div style="font-size: 11.5px; color: rgba(244,237,226,0.78); margin-top: 5px;">{sub}</div></div></div>')

    def text_card(h, name, sub, score):
        return (f'<div style="height: {h}px; border-radius: 28px; background: #ffffff; position: relative; flex-shrink: 0; '
                'box-shadow: 0 1px 2px rgba(60,40,20,0.06);">'
                f'<span style="position: absolute; top: 10px; right: 10px; height: 26px; padding: 0 9px; border-radius: 13px; background: {ink}; '
                f'color: {CREAM}; font-size: 12px; font-weight: 700; display: flex; align-items: center;">{score}</span>'
                '<div style="position: absolute; left: 16px; right: 16px; bottom: 14px;">'
                f'<div style="font-family: {SERIF}; font-size: 28px; line-height: 0.98; color: {ink};">{name}</div>'
                f'<div style="font-size: 11.5px; color: #8a7a6c; margin-top: 6px;">{sub}</div></div></div>')
    seg = ('<div style="display: flex; background: #ffffff; border-radius: 22px; padding: 4px; margin: 0 20px 16px; '
           'box-shadow: 0 1px 2px rgba(60,40,20,0.06);">'
           + "".join(f'<span style="flex: 1; height: 36px; border-radius: 18px; display: flex; align-items: center; justify-content: center; '
                     f'font-size: 14px; font-weight: 600; {"background: " + ink + "; color: " + CREAM + ";" if i == 0 else "color: #7d6e62;"}">{t}</span>'
                     for i, t in enumerate(["For you", "Friends", "Popular"])) + '</div>')
    col_a = (card("steak", 250, "El Mes&oacute;n de la Cava", "Rafael", "9.6")
             + text_card(150, "Buche Perico", "Camila &#183; Zona Colonial", "8.1")
             + card("mofongo", 210, "Adrian Tropical", "Enrique", "7.9"))
    col_b = (card("pasta", 190, "Peperoni", "Enrique", "8.0")
             + card("ceviche", 240, "Segundo Muelle", "Grecia", "8.9")
             + card("wine", 200, "Mitre", "Rafael", "8.3"))
    inner = ('<div style="height: 62px;"></div>'
             '<div style="display: flex; align-items: flex-end; justify-content: space-between; padding: 0 20px 16px;">'
             '<div><div style="font-size: 13px; color: #8a7a6c;">Tonight in Santo Domingo</div>'
             f'<div style="font-family: {SERIF}; font-size: 42px; line-height: 1; color: {ink}; margin-top: 2px;">For you</div></div>'
             + solid_btn("bell", ink, CREAM, 46, "Activity") + '</div>'
             + seg +
             '<div style="display: flex; gap: 10px; padding: 0 16px;">'
             f'<div style="flex: 1; display: flex; flex-direction: column; gap: 10px;">{col_a}</div>'
             f'<div style="flex: 1; display: flex; flex-direction: column; gap: 10px;">{col_b}</div></div>')
    return phone("#f3ede4", ink, inner, tabbar("light", bg_override=ink, fg="rgba(244,237,226,0.55)", active_fg=CREAM))


def b_place():
    ink = "#16110f"
    chip = lambda t, icn: (f'<span style="height: 34px; padding: 0 12px; border-radius: 17px; background: rgba(255,255,255,0.75); '
                           f'color: {ink}; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px;">'
                           f'{ic(icn, 14, 2)}{t}</span>')
    inner = ('<div style="position: absolute; inset: 0;">' + img("pasta") + '</div>'
             + scrim("to top, rgba(12,8,7,0.55) 0%, rgba(12,8,7,0) 45%, rgba(12,8,7,0) 80%, rgba(12,8,7,0.35) 100%") +
             '<div style="position: absolute; top: 60px; left: 18px; right: 18px; display: flex; align-items: center; justify-content: space-between;">'
             f'<span style="height: 40px; padding: 0 14px; border-radius: 20px; {glass("light")} color: {ink}; display: flex; align-items: center; gap: 6px; '
             f'font-size: 15px; font-weight: 700;">{ic("star", 15, 2)}8.0 <span style="font-weight: 400; color: #6b5a4e; font-size: 13px;">Mesa</span></span>'
             f'<span style="height: 40px; padding: 0 18px; border-radius: 20px; background: #ffffff; color: {ink}; display: flex; '
             'align-items: center; font-size: 14px; font-weight: 600;">Save</span></div>'
             f'<div style="position: absolute; left: 50%; top: 372px; transform: translateX(-50%); height: 36px; padding: 0 14px; border-radius: 18px; '
             f'background: #ffffff; color: {ink}; display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; white-space: nowrap;">'
             f'{ic("pin", 14, 2)}Italian &#183; Piantini</div>'
             f'<div style="position: absolute; left: 18px; right: 18px; top: 426px; border-radius: 30px; {glass("light")} padding: 20px 18px; text-align: center;">'
             f'<div style="font-family: {SERIF}; font-size: 44px; line-height: 1; color: {ink};">Peperoni</div>'
             '<div style="font-size: 13px; color: #6b5a4e; margin-top: 8px;">Open until 12 AM &#183; Piantini, Santo Domingo</div></div>'
             f'<div style="position: absolute; left: 18px; right: 18px; top: 560px; border-radius: 30px; {glass("light")} padding: 14px; '
             'display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;">'
             + chip("Handmade pasta", "star") + chip("Date night", "heart") + chip("Wine list", "wine") + chip("5 friends ranked", "users") + '</div>')
    bar = (f'<div style="position: absolute; left: 18px; right: 18px; bottom: 26px; height: 70px; border-radius: 35px; background: {ink}; '
           'display: flex; align-items: center; justify-content: space-between; padding: 0 10px; z-index: 40;">'
           + solid_btn("plus", BURG, CREAM, 50, "Rank") + solid_btn("bookmark", CREAM, ink, 56, "Save") +
           f'<span style="height: 50px; padding: 0 20px; border-radius: 25px; background: rgba(244,237,226,0.12); color: {CREAM}; '
           'display: flex; align-items: center; font-size: 14px; font-weight: 600;">Directions</span></div>')
    return phone("#d9cfc3", ink, inner, bar)


def b_profile():
    ink = "#16110f"
    tiles = ""
    for i, (p, big) in enumerate([("dessert", False), ("ceviche", False), ("steak", True), ("wine", False), ("pasta", False)]):
        w, h = (78, 104) if big else (58, 78)
        tiles += (f'<div style="width: {w}px; height: {h}px; border-radius: {20 if big else 16}px; overflow: hidden; flex-shrink: 0; '
                  f'{"box-shadow: 0 10px 24px rgba(60,40,20,0.25);" if big else "opacity: 0.85;"}">{img(p)}</div>')

    def comment(letter, tone, handle, when, text, likes):
        return ('<div style="display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid rgba(244,237,226,0.08);">'
                + avatar(letter, 40, tone=tone) +
                '<div style="flex: 1; min-width: 0;">'
                f'<div style="font-size: 13.5px; font-weight: 600; color: {CREAM};">{handle} <span style="font-weight: 400; color: rgba(244,237,226,0.45);">&#183; {when}</span></div>'
                f'<div style="font-size: 13.5px; line-height: 1.4; color: rgba(244,237,226,0.75); margin-top: 3px;">{text}</div></div>'
                f'<span style="display: flex; align-items: flex-start; gap: 4px; font-size: 12px; font-weight: 600; color: #c14a5c; padding-top: 2px;">'
                f'{likes}{ic("heart", 14, 2)}</span></div>')
    inner = ('<div style="background: #f3ede4; border-radius: 0 0 36px 36px; padding-bottom: 22px;">'
             '<div style="height: 62px;"></div>'
             '<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 20px 14px;">'
             + circle_btn("back", "light", 40, label="Back") +
             f'<span style="font-size: 15px; font-weight: 600; color: {ink};">@enriquehdz</span>'
             f'<span style="height: 34px; width: 50px; border-radius: 17px; background: {ink}; color: {CREAM}; display: flex; '
             f'align-items: center; justify-content: center;">{ic("more", 18, 2)}</span></div>'
             '<div style="display: flex; flex-direction: column; align-items: center; text-align: center;">'
             + avatar("E", 84, 28, tone=1) +
             f'<div style="font-family: {SERIF}; font-size: 36px; line-height: 1; color: {ink}; margin-top: 12px;">Enrique Hern&aacute;ndez</div>'
             '<div style="font-size: 13px; color: #8a7a6c; margin-top: 6px;">92 ranked &#183; 22 followers &#183; 33 following</div></div>'
             f'<div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 18px;">{tiles}</div></div>'
             '<div style="padding: 20px 20px 0;">'
             '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">'
             f'<div><div style="font-size: 20px; font-weight: 600; color: {CREAM};">Friends&rsquo; notes</div>'
             f'<div style="font-family: {SERIF}; font-size: 15px; color: rgba(244,237,226,0.5);">on Enrique&rsquo;s ranks</div></div>'
             + solid_btn("plus", BURG, CREAM, 40, "Add note") + '</div>'
             + comment("G", 1, "@greciaeats", "1d", "Your El Mes&oacute;n rec was perfect &mdash; pedimos el cordero.", 12)
             + comment("R", 0, "@rafael", "2d", "Peperoni en 8.0 es un crimen. M&iacute;nimo 8.7.", 8)
             + comment("C", 2, "@camila", "4d", "&iquest;Buche Perico con qui&eacute;n? Vamos el viernes.", 5) + '</div>')
    return phone("#0e0b0b", CREAM, inner)


# ================================================================ C · BURGUNDY

def c_feed():
    bg, card_bg = "#1c0609", "#2c0b10"

    def top_card(photo, name, hood, score, who, w=300):
        return (f'<div style="width: {w}px; height: 190px; border-radius: 28px; overflow: hidden; position: relative; flex-shrink: 0;">'
                + img(photo) + scrim("to top, rgba(28,6,9,0.92) 0%, rgba(28,6,9,0) 60%") +
                f'<span style="position: absolute; top: 12px; right: 12px;">{circle_btn("heart", "warm", 38, label="Save")}</span>'
                '<div style="position: absolute; left: 16px; right: 16px; bottom: 14px; display: flex; align-items: flex-end; justify-content: space-between;">'
                f'<div><div style="font-family: {SERIF}; font-size: 27px; line-height: 1; color: {CREAM};">{name}</div>'
                f'<div style="display: flex; align-items: center; gap: 5px; font-size: 12px; color: rgba(244,237,226,0.65); margin-top: 6px;">{ic("pin", 13, 2)}{hood}</div></div>'
                f'<div style="text-align: right;"><div style="font-family: {SERIF}; font-size: 30px; line-height: 1; color: {CREAM};">{score}</div>'
                f'<div style="font-size: 11px; color: rgba(244,237,226,0.6); margin-top: 3px;">{who}</div></div></div></div>')

    def list_card(photo, name, sub, score, who):
        return (f'<div style="height: 128px; border-radius: 28px; background: {card_bg}; position: relative; overflow: hidden; margin: 0 18px 12px;">'
                f'<div style="position: absolute; right: 0; top: 0; bottom: 0; width: 58%;">{img(photo)}</div>'
                f'<div style="position: absolute; right: 0; top: 0; bottom: 0; width: 58%; background: linear-gradient(to right, {card_bg} 0%, rgba(44,11,16,0.4) 45%, rgba(44,11,16,0) 100%);"></div>'
                '<div style="position: absolute; left: 18px; top: 16px; bottom: 14px; display: flex; flex-direction: column; justify-content: space-between;">'
                f'<div><div style="font-family: {SERIF}; font-size: 25px; line-height: 1; color: {CREAM};">{name}</div>'
                f'<div style="font-size: 12px; color: rgba(244,237,226,0.6); margin-top: 5px;">{sub}</div></div>'
                + solid_btn("arrow", CREAM, bg, 38, "Open") + '</div>'
                f'<div style="position: absolute; right: 12px; top: 12px; height: 28px; padding: 0 10px; border-radius: 14px; {glass("warm")} '
                f'color: {CREAM}; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 5px;">{who} &#183; '
                f'<span style="font-family: {SERIF}; font-size: 16px;">{score}</span></div></div>')
    inner = ('<div style="height: 62px;"></div>'
             '<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 18px 16px;">'
             + avatar("E", 46, tone=0, ring="rgba(244,237,226,0.3)") + circle_btn("search", "warm", 46, label="Search") + '</div>'
             f'<div style="padding: 0 20px 20px;"><div style="font-family: {SERIF}; font-size: 38px; line-height: 1; color: {CREAM};">Good evening, Enrique</div>'
             '<div style="font-size: 14px; color: rgba(244,237,226,0.55); margin-top: 6px;">Where are we going tonight?</div></div>'
             + label("Top tonight", "", "See all &#8250;", color_soft="rgba(244,237,226,0.55)", size=20) +
             '<div style="display: flex; gap: 12px; padding: 0 18px 24px; overflow: hidden;">'
             + top_card("wine", "Mitre", "Bella Vista", "8.3", "Grecia")
             + top_card("dessert", "Positano", "Serrall&eacute;s", "8.6", "Camila") + '</div>'
             '<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 20px 12px;">'
             '<span style="font-size: 20px; font-weight: 600;">Your six</span>' + circle_btn("sliders", "warm", 40, label="Filter") + '</div>'
             + list_card("ceviche", "Segundo Muelle", "Peruvian &#183; Naco", "8.9", "Grecia")
             + list_card("steak", "El Mes&oacute;n", "Steakhouse &#183; Serrall&eacute;s", "9.6", "Rafael"))
    return phone(bg, CREAM, inner, tabbar("warm", bg_override="rgba(16,3,5,0.82)", active_bg=CREAM, active_fg=bg,
                                          fab_bg=BURG, fg="rgba(244,237,226,0.55)"))


def c_place():
    bg, card_bg = "#1c0609", "#2c0b10"
    tile = lambda icn, t, v: (f'<div style="border-radius: 24px; background: {card_bg}; padding: 16px; display: flex; flex-direction: column; gap: 10px;">'
                              f'<span style="color: {CREAM};">{ic(icn, 22, 1.7)}</span>'
                              f'<div><div style="font-size: 15px; font-weight: 600; color: {CREAM};">{t}</div>'
                              f'<div style="font-size: 12.5px; color: rgba(244,237,226,0.55); margin-top: 2px;">{v}</div></div></div>')
    inner = ('<div style="height: 60px;"></div>'
             '<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 18px 10px;">'
             + circle_btn("back", "warm", 44, label="Back") +
             f'<span style="font-size: 17px; font-weight: 600; color: {CREAM};">Details</span>'
             + circle_btn("share", "warm", 44, label="Share") + '</div>'
             '<div style="position: relative; height: 300px;">'
             f'<span style="position: absolute; top: -6px; left: 0; right: 0; text-align: center; font-family: {SERIF}; font-size: 230px; '
             'line-height: 1; color: rgba(244,237,226,0.15); letter-spacing: -0.02em;">8.7</span>'
             '<div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 330px; height: 190px; border-radius: 32px; '
             'overflow: hidden; box-shadow: 0 24px 50px rgba(0,0,0,0.5);">' + img("tapas") + '</div></div>'
             f'<div style="margin: 18px 18px 12px; border-radius: 26px; background: {card_bg}; padding: 12px 14px; display: flex; align-items: center; gap: 12px;">'
             + avatar("L", 48, tone=5, text=bg) +
             f'<div style="flex: 1;"><div style="font-size: 17px; font-weight: 600; color: {CREAM};">Lul&uacute; Tasting Bar</div>'
             '<div style="font-size: 12.5px; color: rgba(244,237,226,0.55); margin-top: 2px;">$$ &#183; Tapas &#183; Zona Colonial</div></div>'
             + circle_btn("heart", "warm", 40, label="Save") + '</div>'
             '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 0 18px;">'
             + tile("star", "Mesa score", "8.7 &#183; 19 members") + tile("users", "Friends", "6 ranked it")
             + tile("clock", "Open until", "1 AM tonight") + tile("wine", "Best for", "Date night") + '</div>')
    slide = (f'<div style="position: absolute; left: 18px; right: 18px; bottom: 26px; height: 72px; border-radius: 36px; background: {card_bg}; '
             'display: flex; align-items: center; padding: 0 8px; z-index: 40;">'
             + solid_btn("check", CREAM, bg, 56, "Rank") +
             f'<span style="flex: 1; text-align: center; font-size: 16px; font-weight: 600; color: {CREAM};">Rank this place</span>'
             '<span style="padding-right: 18px; font-size: 18px; letter-spacing: 2px; color: rgba(244,237,226,0.35);">&#8250;&#8250;&#8250;</span></div>')
    return phone(bg, CREAM, inner, slide)


def c_profile():
    bg = "#1c0609"
    chip = lambda t: (f'<span style="height: 32px; padding: 0 13px; border-radius: 16px; {glass("warm")} color: {CREAM}; font-size: 13px; '
                      f'display: flex; align-items: center;">{t}</span>')
    inner = ('<div style="position: absolute; inset: 0;">' + img("bar") + '</div>'
             + scrim("to top, rgba(28,6,9,1) 0%, rgba(28,6,9,0.85) 34%, rgba(28,6,9,0.2) 62%, rgba(28,6,9,0.55) 100%") +
             '<div style="position: absolute; top: 60px; left: 18px; right: 18px; display: flex; justify-content: space-between; z-index: 3;">'
             + circle_btn("back", "warm", 44, label="Back") +
             f'<span style="height: 44px; padding: 0 18px; border-radius: 22px; {glass("warm")} color: {CREAM}; display: flex; align-items: center; '
             'font-size: 14px; font-weight: 600;">Edit</span></div>'
             f'<div style="position: absolute; top: 118px; left: 0; right: 0; text-align: center; font-family: {SERIF}; font-size: 250px; '
             'line-height: 1; color: rgba(244,237,226,0.92); letter-spacing: -0.03em;">92</div>'
             '<div style="position: absolute; top: 362px; left: 0; right: 0; text-align: center; font-size: 12px; font-weight: 700; '
             'letter-spacing: 0.16em; color: rgba(244,237,226,0.6);">PLACES RANKED</div>'
             '<div style="position: absolute; left: 22px; right: 22px; bottom: 124px;">'
             f'<div style="font-family: {SERIF}; font-size: 46px; line-height: 0.96; color: {CREAM};">Enrique&rsquo;s<br>Santo Domingo</div>'
             '<div style="font-size: 14.5px; line-height: 1.45; color: rgba(244,237,226,0.65); margin-top: 12px;">#14 in the DR &#183; 22 followers &#183; '
             '33 following. Best for late dinners in Piantini.</div>'
             '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px;">' + chip("Italian") + chip("Wine bars") + chip("Omakase") + chip("Piantini") + '</div></div>')
    slide = ('<div style="position: absolute; left: 18px; right: 18px; bottom: 28px; height: 72px; border-radius: 36px; '
             f'{glass("warm")} display: flex; align-items: center; padding: 0 8px; z-index: 40;">'
             + solid_btn("share", CREAM, bg, 56, "Share") +
             f'<span style="flex: 1; text-align: center; font-size: 16px; font-weight: 600; color: {CREAM};">Share my list</span>'
             '<span style="padding-right: 18px; font-size: 18px; letter-spacing: 2px; color: rgba(244,237,226,0.35);">&#8250;&#8250;&#8250;</span></div>')
    return phone(bg, CREAM, inner, slide)


# ================================================================ boards

def board(title, w, h, inner, extra_css=""):
    props_json = json.dumps({"$preview": {"width": w, "height": h}}, separators=(",", ":"))
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            f'<title>{title}</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'<link rel="stylesheet" href="{GF}">\n<style>\nbody {{ margin: 0; }}\nbutton {{ font: inherit; cursor: pointer; }}\n'
            f'{extra_css}\n</style>\n</helmet>\n'
            f'<div style="width: {w}px; height: {h}px; box-sizing: border-box; font-family: {UI}; font-synthesis: none;">\n'
            f'{inner}\n</div>\n</x-dc>\n'
            f"<script type=\"text/x-dc\" data-dc-script data-props='{props_json}'>\n"
            "class Component extends DCLogic {\n  renderVals() { return {}; }\n}\n</script>\n</body>\n</html>\n")


def concept_board(fname, title, bg, fg, sub_fg, label_txt, blurb, swatches, screens, captions):
    sw = "".join(f'<span style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: {sub_fg};">'
                 f'<span style="width: 22px; height: 22px; border-radius: 50%; background: {c}; box-shadow: inset 0 0 0 1px rgba(128,128,128,0.35);"></span>{n}</span>'
                 for c, n in swatches)
    phones = "".join(f'<div style="display: flex; flex-direction: column; align-items: center; gap: 22px;">{s}'
                     f'<span style="font-size: 14px; font-weight: 600; color: {sub_fg};">{c}</span></div>'
                     for s, c in zip(screens, captions))
    inner = (f'<div style="width: 100%; height: 100%; box-sizing: border-box; background: {bg}; padding: 56px 64px; '
             'display: flex; flex-direction: column; position: relative; overflow: hidden;">'
             f'<div style="position: absolute; top: 20px; left: 0; right: 0; text-align: center; font-family: {SERIF}; font-size: 190px; '
             f'line-height: 1; color: {fg}; opacity: 0.05; letter-spacing: 0.02em; text-transform: uppercase; pointer-events: none;">{title}</div>'
             '<div style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 44px; position: relative;">'
             f'<div><div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: {sub_fg};">{label_txt}</div>'
             f'<div style="font-family: {SERIF}; font-size: 60px; line-height: 1; color: {fg}; margin-top: 8px;">{title}</div>'
             f'<p style="margin: 12px 0 0; font-size: 15px; line-height: 1.5; color: {sub_fg}; max-width: 640px;">{blurb}</p></div>'
             f'<div style="display: flex; flex-direction: column; gap: 10px;">{sw}</div></div>'
             f'<div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative;">{phones}</div></div>')
    return fname, board(title, 1480, 1260, inner)


def main_board():
    def card(href, bg, fg, title, text, sw):
        dots = "".join(f'<span style="width: 18px; height: 18px; border-radius: 50%; background: {c}; box-shadow: inset 0 0 0 1px rgba(128,128,128,0.4);"></span>' for c in sw)
        return (f'<a href="{href}" class="card" style="flex: 1; min-width: 0; border-radius: 32px; background: {bg}; color: {fg}; padding: 28px; '
                'text-decoration: none; display: flex; flex-direction: column; gap: 12px; min-height: 260px; box-sizing: border-box;">'
                f'<div style="display: flex; gap: 6px;">{dots}</div>'
                f'<div style="font-family: {SERIF}; font-size: 44px; line-height: 1;">{title}</div>'
                f'<div style="font-size: 14px; line-height: 1.5; opacity: 0.75;">{text}</div>'
                f'<div style="margin-top: auto; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600;">See the screens {ic("arrow", 16, 2)}</div></a>')
    inner = ('<div style="width: 100%; height: 100%; box-sizing: border-box; background: #120d0e; color: #f4ede2; padding: 64px 72px; '
             'display: flex; flex-direction: column;">'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(244,237,226,0.55);">Mesa &#183; modern iOS</div>'
             f'<div style="font-family: {SERIF}; font-size: 68px; line-height: 1; margin-top: 10px;">Three directions</div>'
             '<p style="margin: 14px 0 40px; font-size: 16px; line-height: 1.5; color: rgba(244,237,226,0.7); max-width: 760px;">'
             'Your references &mdash; full-bleed photos, frosted glass, a floating tab bar, big rounded cards &mdash; in Mesa&rsquo;s '
             'burgundy, cream, white and black. Same content and rules as before; only the interface changes.</p>'
             '<div style="display: flex; gap: 20px;">'
             + card("Noir.dc.html", "#0b0809", CREAM, "Noir", "Black, glass and burgundy. Closest to your first reference.", ["#0b0809", BURG, CREAM])
             + card("Cream.dc.html", "#f3ede4", "#16110f", "Cream", "Light cream and white, black panels, serif names over photos.", ["#f3ede4", "#ffffff", "#16110f", BURG])
             + card("Burgundy.dc.html", "#1c0609", CREAM, "Burgundy", "Oxblood ground, cream buttons, big numbers.", ["#1c0609", "#2c0b10", CREAM])
             + '</div>'
             '<div style="margin-top: auto; font-size: 13px; color: rgba(244,237,226,0.45);">Display: Instrument Serif, upright. Interface: the iPhone&rsquo;s '
             'own system font. Restaurant photos are the real ones Mesa already shows; names and numbers are examples.</div></div>')
    css = (".card { transition: transform 150ms ease; } .card:hover { transform: translateY(-3px); }\n"
           ".card:focus-visible { outline: 2px solid #c09050; outline-offset: 3px; }\n"
           "@media (prefers-reduced-motion: reduce) { .card { transition: none; } .card:hover { transform: none; } }")
    return "Main.dc.html", board("Mesa iOS directions", 1400, 820, inner, css)


def main():
    os.makedirs(OUT, exist_ok=True)
    outs = [
        main_board(),
        concept_board("Noir.dc.html", "Noir", "#16120f", CREAM, "rgba(244,237,226,0.6)", "Direction A",
                      "Black ground, burgundy used only for what matters &mdash; tonight, and the rank button. Frosted-glass "
                      "pills over full-bleed photos, a floating tab bar.",
                      [("#0b0809", "Black"), (BURG, "Burgundy"), (CREAM, "Cream"), ("#171213", "Card")],
                      [a_feed(), a_place(), a_profile()], ["Feed", "Restaurant", "Profile"]),
        concept_board("Cream.dc.html", "Cream", "#e6ddd1", "#16110f", "#6b5a4e", "Direction B",
                      "Cream and white with black for weight. Rounded photo cards with serif names on them, frosted "
                      "light panels, black pill buttons; burgundy for the rank action.",
                      [("#f3ede4", "Cream"), ("#ffffff", "White"), ("#16110f", "Black"), (BURG, "Burgundy")],
                      [b_feed(), b_place(), b_profile()], ["Feed", "Restaurant", "Profile"]),
        concept_board("Burgundy.dc.html", "Burgundy", "#2a0c10", CREAM, "rgba(244,237,226,0.6)", "Direction C",
                      "Oxblood instead of black. Cream becomes the accent &mdash; round cream buttons, slide-to-rank &mdash; "
                      "and scores get the giant-number treatment.",
                      [("#1c0609", "Oxblood"), ("#2c0b10", "Card"), (CREAM, "Cream"), (BURG, "Burgundy")],
                      [c_feed(), c_place(), c_profile()], ["Feed", "Restaurant", "Profile"]),
    ]
    for fname, html in outs:
        with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
            f.write(html)
        print(f"{fname:18s} {len(html):7d} bytes")


if __name__ == "__main__":
    main()
