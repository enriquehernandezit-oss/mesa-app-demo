"""Round 8 (2026-09-28): black + burgundy at night, the full-photo place page with details on scroll,
the one-hero tonight card for every event surface, no rainbow, and the podium/friend cards as previewed.
Replaces a few screen functions in screens_a/b and rebinds them where other screens reuse them."""
from mesa_ui import (ELL, GL, HGL, PGL, SERIF, avatar, btn, card, cta, field, group, ic, img, map_svg, pill, pills, rank_bar, row, scrim,
                     score_pill, section, sheet, stack, tabbar, thumb, ttext, word)
import screens_a as A
import screens_b as B

TOP = A.TOP


def score_glass(score, who="Mesa", h=44):
    return (f'<span style="height: {h}px; padding: 0 15px; border-radius: {h // 2}px; {HGL} display: flex; align-items: center; '
            f'gap: 6px; white-space: nowrap;"><span style="font-family: {SERIF}; font-size: 21px; line-height: 1; padding-top: 2px;">{score}</span>'
            f'<span style="font-size: 13px; font-weight: 700;">{word(score)}</span>'
            f'<span style="font-size: 12.5px; opacity: 0.6;">&#183; {who}</span></span>')


def hero_page(bg, left, right, chip, chip_icon, title, sub, tags, bar, hint="Friends, dishes and menu below", title_size=46):
    """The place page founders picked (Cream preview's Peperoni): the photo is the page; frosted panels hold the name and the tags."""
    shade = ('<div style="position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 20%, '
             'rgba(0,0,0,0) 52%, rgba(0,0,0,0.42) 100%);"></div>')
    top = ('<div style="position: absolute; top: 58px; left: 16px; right: 16px; display: flex; align-items: center; justify-content: space-between; z-index: 30;">'
           f'<div style="display: flex; gap: 8px; align-items: center;">{left}</div><div style="display: flex; gap: 8px;">{right}</div></div>')
    chip_el = ('<div style="position: absolute; left: 0; right: 0; top: 394px; display: flex; justify-content: center; z-index: 20;">'
               f'<span style="height: 36px; padding: 0 15px; border-radius: 18px; background: var(--card); color: var(--fg); box-shadow: 0 6px 18px rgba(0,0,0,0.18); '
               f'display: flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 650; white-space: nowrap;">{ic(chip_icon, 15, 2)}{chip}</span></div>')
    name = (f'<div style="position: absolute; left: 18px; right: 18px; top: 442px; border-radius: 30px; {HGL} padding: 20px 18px 18px; text-align: center; '
            f'z-index: 20;"><div style="font-family: {SERIF}; font-size: {title_size}px; line-height: 1;">{title}</div>'
            f'<div style="font-size: 13px; opacity: 0.68; margin-top: 8px;">{sub}</div></div>')
    tag_els = "".join(f'<span style="height: 34px; padding: 0 12px; border-radius: 17px; background: var(--hchip); color: var(--hglass-fg); font-size: 13px; font-weight: 600; '
                      f'display: flex; align-items: center; gap: 6px; white-space: nowrap;">{ic(i, 14, 2)}{t}</span>' for t, i in tags)
    tag_panel = (f'<div style="position: absolute; left: 18px; right: 18px; top: {442 + (110 if title_size >= 44 else 140) + 12}px; border-radius: 30px; {HGL} '
                 f'padding: 13px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; z-index: 20;">{tag_els}</div>')
    h = (f'<div style="position: absolute; left: 0; right: 0; bottom: 106px; display: flex; justify-content: center; z-index: 20;">'
         f'<span style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #f5efe4; '
         f'text-shadow: 0 1px 8px rgba(0,0,0,0.5);">{ic("chev_d", 14, 2.2)}{hint}</span></div>') if hint else ""
    return f'<div style="position: absolute; inset: 0;">{bg}</div>' + shade + top + chip_el + name + tag_panel + h + bar


PEPERONI_TAGS = [("Handmade pasta", "star"), ("Date night", "heart"), ("Wine list", "wine"), ("5 friends ranked", "users")]


def place_top():
    return hero_page(img("pasta"), btn("back", 44, "hero", "Back") + score_glass("8.0"), btn("share", 44, "hero", "Share"),
                     "Italian &#183; Piantini", "pin", "Peperoni", "Open until 12 AM &#183; Piantini, Santo Domingo", PEPERONI_TAGS,
                     rank_bar("Rank it"))


def place_header(title="Peperoni", score="8.0"):
    return (f'<div style="position: absolute; top: 0; left: 0; right: 0; padding: 58px 16px 10px; {GL} border-width: 0 0 1px 0; z-index: 30; '
            'display: flex; align-items: center; gap: 10px;">' + btn("back", 40, "chip", "Back") +
            f'<span style="flex: 1; font-family: {SERIF}; font-size: 23px; {ELL}">{title}</span>' + score_pill(score, "chip", 13) + '</div>')


def details_sheet(inner, top=210):
    return (f'<div style="position: absolute; left: 0; right: 0; top: {top}px; bottom: 0; border-radius: 32px 32px 0 0; background: var(--bg); '
            'box-shadow: 0 -12px 40px rgba(0,0,0,0.2); overflow: hidden; z-index: 10;">'
            '<div style="width: 38px; height: 5px; border-radius: 3px; background: var(--faint); margin: 8px auto 6px; opacity: 0.8;"></div>'
            + inner + '</div>')


def place_more():
    stats = "".join(
        f'<div style="flex: 1; border-radius: 20px; background: var(--card); box-shadow: var(--lift); padding: 12px 12px 10px;">'
        f'<div style="display: flex; align-items: baseline; gap: 5px;"><span style="font-family: {SERIF}; font-size: 27px; line-height: 1;">{v}</span>'
        f'<span style="font-size: 11px; font-weight: 700; color: var(--accent-text);">{word(v) if v != "&ndash;" else ""}</span></div>'
        f'<div style="font-size: 12px; color: var(--muted); margin-top: 4px;">{l}</div></div>'
        for v, l in [("8.0", "Everyone &#183; 24"), ("8.4", "Friends &#183; 5"), ("&ndash;", "You &#183; not yet")])
    notes = "".join(
        f'<div style="display: flex; gap: 12px; padding: 11px 0; {"border-top: 1px solid var(--line);" if i else ""}">{avatar(l, 36, t)}'
        f'<div style="flex: 1; min-width: 0;"><div style="font-size: 14px; font-weight: 600;">{n} <span style="color: var(--muted); font-weight: 400;">&#183; {w}</span></div>'
        f'<div style="font-family: {SERIF}; font-size: 18px; line-height: 1.2; margin-top: 2px;">&ldquo;{q}&rdquo;</div></div>{A.score_stack(s, 20)}</div>'
        for i, (l, t, n, w, q, s) in enumerate([("L", 1, "Luc&iacute;a Fern&aacute;ndez", "3d", "El cacio e pepe, siempre.", "8.9"),
                                                ("D", 0, "Diego Read", "1w", "Pide mesa adentro, afuera hace calor.", "8.2"),
                                                ("N", 3, "Natalia Cruz", "2w", "Buena carta de vinos italianos.", "7.9")]))
    dish = lambda p, n, by: (f'<div style="width: 150px; flex-shrink: 0;"><div style="height: 132px; border-radius: 22px; overflow: hidden;">{img(p)}</div>'
                             f'<div style="font-family: {SERIF}; font-size: 18px; margin-top: 7px; {ELL}">{n}</div>'
                             f'<div style="font-size: 12.5px; color: var(--muted);">by {by}</div></div>')
    inner = (f'<div style="display: flex; gap: 8px; padding: 6px 16px 0;">{stats}</div>'
             + section("Friends", "5 ranked it", pad="22px 20px 2px") + f'<div style="padding: 0 20px;">{notes}</div>'
             + section("Dishes", "+ Add a dish", pad="18px 20px 12px")
             + '<div style="display: flex; gap: 10px; padding: 0 20px; overflow: hidden;">' + dish("pasta", "Cacio e pepe", "Luc&iacute;a")
             + dish("pizza", "Margherita", "Diego") + dish("dessert", "Tiramis&ugrave;", "Natalia") + '</div>')
    photo = f'<div style="position: absolute; left: 0; right: 0; top: 0; height: 280px;">{img("pasta")}</div>'
    return photo + details_sheet(inner, 196) + place_header() + rank_bar("Rank it")


def place_info():
    tiles = "".join(
        f'<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; color: var(--fg2);">'
        f'{btn(i, 54, "chip", t)}{t}</div>' for i, t in [("menu", "Menu"), ("phone", "Call"), ("globe", "Website"), ("nav", "Directions")])
    info = group([row("C. Gustavo Mej&iacute;a Ricart 34", None, "pin", True, None, "Piantini, Santo Domingo"),
                  row("Open until 12 AM", None, "clock", True, None, "Opens at 12 PM tomorrow"),
                  row("$$$ &#183; Italian", None, "wine", False),
                  row("In 2 lists", None, "list", True, None, "La Dolce Vita &#183; Piantini After Dark")])
    mp = ('<div style="position: relative; height: 150px; margin: 12px 16px 0; border-radius: 26px; overflow: hidden;">' + map_svg(True, True) +
          f'<span style="position: absolute; right: 12px; bottom: 12px; height: 32px; padding: 0 12px; border-radius: 16px; {GL} color: var(--glass-fg); '
          'font-size: 12.5px; font-weight: 650; display: flex; align-items: center;">Open map</span></div>')
    inner = (f'<div style="display: flex; justify-content: space-between; padding: 14px 28px 18px;">{tiles}</div>' + info + mp)
    return details_sheet(inner, 116) + place_header() + rank_bar("Rank it")


def place_nophoto():
    return hero_page(map_svg(True, True), btn("back", 44, "hero", "Back") + score_glass("9.6"), btn("share", 44, "hero", "Share"),
                     "Contemporary &#183; Piantini", "pin", "Cyril Restaurante", "C. Gustavo Mej&iacute;a Ricart 54 &#183; Piantini",
                     [("No photos yet &mdash; add the first", "camera"), ("#1 on your list", "trophy"), ("Isabela ranked it 8.7", "users")],
                     rank_bar("Rank again"), "Friends and details below", 40)


# ---------------------------------------------------------------- events: the one hero (round 8)

def event_hero(e, h=372, when=None):
    w = when or f'{e["time"]} &#183; {e["hood"]}'
    return (f'<div style="position: relative; height: {h}px; margin: 0 20px; border-radius: 32px; overflow: hidden;">' + img(e["p"])
            + scrim("to top, rgba(8,5,6,0.45) 0%, rgba(8,5,6,0) 45%") +
            f'<span style="position: absolute; top: 14px; left: 14px; height: 34px; padding: 0 13px; border-radius: 17px; {PGL} '
            f'font-size: 13px; font-weight: 650; display: flex; align-items: center;">{w}</span>'
            f'<span style="position: absolute; top: 12px; right: 12px;">{btn("bookmark", 40, "photo", "Save")}</span>'
            f'<div style="position: absolute; left: 10px; right: 10px; bottom: 10px; border-radius: 24px; {HGL} padding: 15px 16px 14px;">'
            f'<div style="font-family: {SERIF}; font-size: 28px; line-height: 1.02;">{e["flat"]}</div>'
            f'<div style="font-size: 13px; opacity: 0.7; margin-top: 4px;">{e["place"]} &#183; {e["price"]}</div>'
            '<div style="display: flex; align-items: center; gap: 10px; margin-top: 12px;">' + stack(e["who"], 26, "rgba(0,0,0,0.3)") +
            f'<span style="font-size: 13px; flex: 1;">{e["going"]}</span>' + cta("I&rsquo;m going", "solid", h=36, size=13.5, grow=False) + '</div></div></div>')


def dots(n=3, at=0):
    return ('<div style="display: flex; justify-content: center; gap: 6px; margin-top: 12px;">'
            + "".join(f'<span style="width: {18 if i == at else 6}px; height: 6px; border-radius: 3px; background: {"var(--fg)" if i == at else "var(--faint)"};"></span>'
                      for i in range(n)) + '</div>')


def feed_for_you():
    return (A.feed_header() + pills(A.FEED_PILLS) + A.your_six() + section("Tonight", "3 events", pad="26px 20px 12px")
            + event_hero(A.EVENTS[0]) + tabbar("feed"))


def feed_tonight():
    body = ('<div style="height: 118px;"></div>' + section("Tonight", "3 events", pad="4px 20px 12px") + event_hero(A.EVENTS[0]) + dots()
            + section("From your friends", "Newest first", pad="24px 20px 12px") + A.friend_card(A.FRIENDS[0]) + A.friend_card(A.FRIENDS[1]))
    return body + A.pinned(A.FEED_PILLS) + tabbar("feed")


def feed_tonight_pick():
    """No events tonight (or events switched off): the same spot shows tonight's pick."""
    pick = ('<div style="position: relative; height: 300px; margin: 0 20px; border-radius: 32px; overflow: hidden;">' + img("steak")
            + f'<span style="position: absolute; top: 14px; left: 14px; height: 34px; padding: 0 13px; border-radius: 17px; {PGL} font-size: 13px; '
            'font-weight: 650; display: flex; align-items: center;">Tonight&rsquo;s pick &#183; open till 1 AM</span>'
            f'<div style="position: absolute; left: 10px; right: 10px; bottom: 10px; border-radius: 24px; {HGL} padding: 15px 16px 14px;">'
            f'<div style="display: flex; align-items: center; justify-content: space-between;"><div style="font-family: {SERIF}; font-size: 28px; line-height: 1;">'
            f'El Mes&oacute;n de la Cava</div>{score_pill("9.6", "chip", 12)}</div>'
            '<div style="font-size: 13px; opacity: 0.7; margin-top: 5px;">Rafael&rsquo;s #1 &#183; Steakhouse &#183; Serrall&eacute;s</div></div></div>')
    body = ('<div style="height: 118px;"></div>' + section("Tonight", "No events today", pad="4px 20px 12px") + pick
            + section("From your friends", "Newest first", pad="24px 20px 12px") + A.friend_card(A.FRIENDS[2]) + A.friend_card(A.FRIENDS[3]))
    return body + A.pinned(A.FEED_PILLS) + tabbar("feed")


def explore_events():
    strip = ('<div style="display: flex; align-items: flex-end; gap: 2px; padding: 16px 12px 0; overflow: hidden;">'
             f'<div style="width: 44px; display: flex; flex-direction: column; align-items: center; gap: 5px; flex-shrink: 0;"><span style="font-size: 11px; '
             f'color: var(--muted); font-weight: 650;">SEP</span>{btn("calendar", 40, "chip", "Pick a date")}<span style="height: 4px;"></span></div>'
             + A.date_cell("TODAY", "28", True) + A.date_cell("TUE", "29") + A.date_cell("WED", "30", False, ("--accent",))
             + A.date_cell("THU", "1") + A.date_cell("FRI", "2", False, ("--accent",)) + A.date_cell("SAT", "3", False, ("--accent", "--accent"))
             + A.date_cell("SUN", "4") + '</div>')
    cats = ('<div style="display: flex; gap: 8px; padding: 12px 20px 4px; overflow: hidden;">' + A.cat_pill("All", "", "", True)
            + A.cat_pill("Tastings", "--fg", "wine") + A.cat_pill("Food", "--fg", "feed") + A.cat_pill("Music", "--fg", "music")
            + A.cat_pill("Brunch", "--fg", "sun") + '</div>')
    return (A.explore_head(1) + strip + cats + A.section_label("Featured") + event_hero(A.EVENTS[2], 330, "Wed 30 Sep &#183; 7 PM") + dots()
            + '<div style="height: 12px;"></div>' + A.ticket(A.EVENTS[1], (16, 16)) + tabbar("explore"))


def event_top():
    return hero_page(img("ceviche"), btn("back", 44, "hero", "Back"), btn("share", 44, "hero", "Share"),
                     "Special &#183; Set menu RD$3,500", "feed", "Aniversario:<br>Omakase Especial", "Samurai &#183; Fri, Oct 2 &#183; 7:00 PM",
                     [("In 4 days", "clock"), ("30 spots left", "users"), ("3 friends going", "users")],
                     B.event_bar(), "When, where and who&rsquo;s going below", 38)


# ---------------------------------------------------------------- your list: the podium as previewed

MINE = [("steak", "El Mes&oacute;n de la Cava", "Steakhouse &#183; Serrall&eacute;s", "9.6"), ("ceviche", "Segundo Muelle", "Peruvian &#183; Naco", "9.4"),
        ("dessert", "Positano", "Italian &#183; Serrall&eacute;s", "9.3"), ("wine", "Mitre", "Wine bar &#183; Bella Vista", "9.1"),
        (None, "Cyril Restaurante", "Contemporary &#183; Piantini", "9.0"), ("branzino", "Boga Boga", "Seafood &#183; Naco", "8.9"),
        (None, "Forno Bravo &ndash; Naco", "Italian &#183; Naco", "8.8")]


def podium_big(n, photo, name, meta, score):
    face = img(photo) + scrim("to top, rgba(12,6,6,0.85) 0%, rgba(12,6,6,0) 62%") if photo else ""
    col = "#f5efe4" if photo else "var(--fg)"
    bg = "" if photo else "background: var(--card2); box-shadow: inset 0 0 0 1px var(--line);"
    return (f'<div style="position: relative; height: 204px; margin: 0 16px; border-radius: 30px; overflow: hidden; {bg}">{face}'
            f'<span style="position: absolute; left: 14px; bottom: -16px; font-family: {SERIF}; font-size: 168px; line-height: 1; color: {col}; opacity: {0.95 if photo else 0.14};">{n}</span>'
            f'<div style="position: absolute; left: 112px; right: 84px; bottom: 18px; color: {col};">'
            f'<div style="font-family: {SERIF}; font-size: 28px; line-height: 1.02;">{name}</div>'
            f'<div style="font-size: 12.5px; opacity: 0.75; margin-top: 5px;">{meta}</div></div>'
            f'<div style="position: absolute; right: 18px; bottom: 16px; text-align: right; color: {col};">'
            f'<div style="font-family: {SERIF}; font-size: 38px; line-height: 1;">{score}</div>'
            f'<div style="font-size: 11px; font-weight: 700; opacity: 0.8; margin-top: 2px;">{word(score)}</div></div></div>')


def mini_podium():
    tiles = [(1, "steak", "El Mes&oacute;n", "9.6"), (2, "ceviche", "Segundo Muelle", "9.4"), (3, "dessert", "Positano", "9.3")]
    return ('<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 0 16px;">'
            + "".join(A.podium_half(n, p, name, s).replace("height: 146px", "height: 132px").replace("font-size: 90px", "font-size: 70px")
                      .replace("left: 58px", "left: 12px").replace("bottom: 14px; font-family", "bottom: 58px; font-family")
                      for n, p, name, s in tiles) + '</div>')


# rebind so every screen that reuses these picks up round 8
A.podium_big = podium_big
A.MINE = MINE
B.mini_podium = mini_podium
B.place_top = place_top


# ---------------------------------------------------------------- "How was it?" as a slider (round 8)
# Same three answers the ranking needs (loved 6.7–10, fine 3.4–6.6, didn't love 0–3.3), now one gesture.
# The place's own photo is the picture: vivid when loved, muted when fine, black-and-white when not.

MOUTH = {"loved": "M6.5 10.2c1.5 2.4 3.4 3.6 5.5 3.6s4-1.2 5.5-3.6",
         "fine": "M7 12.4h10",
         "didnt": "M6.5 14.8c1.5-2.4 3.4-3.6 5.5-3.6s4 1.2 5.5 3.6"}
FEEL = [("didnt", "Didn&rsquo;t love it", "0 &ndash; 3.3", "grayscale(1) brightness(0.8) contrast(1.05)", "0 16px 40px rgba(0,0,0,0.18)"),
        ("fine", "It was fine", "3.4 &ndash; 6.6", "saturate(0.5) brightness(0.93)", "0 16px 40px rgba(0,0,0,0.18)"),
        ("loved", "Loved it", "6.7 &ndash; 10", "saturate(1.15) contrast(1.04)", "0 22px 60px rgba(122,26,41,0.45)")]


def mouth(kind, size=24):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" '
            f'stroke-linecap="round" aria-hidden="true"><path d="{MOUTH[kind]}"/></svg>')


def feel_slider(active, w=313, thumb=56, labels=True):
    keys = [f[0] for f in FEEL]
    i = keys.index(active)
    xs = [0, w / 2, w]
    stops = "".join(f'<span style="position: absolute; left: {x - 5}px; top: {thumb / 2 - 5}px; width: 10px; height: 10px; border-radius: 50%; '
                    f'background: var(--faint);"></span>' for x in xs)
    knob = (f'<span style="position: absolute; left: {xs[i] - thumb / 2}px; top: 0; width: {thumb}px; height: {thumb}px; border-radius: 50%; '
            f'background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center; '
            f'box-shadow: 0 8px 22px rgba(122,26,41,0.4), 0 0 0 5px var(--bg);">{mouth(active, int(thumb * 0.5))}</span>')
    track = (f'<span style="position: absolute; left: 0; right: 0; top: {thumb / 2 - 2}px; height: 4px; border-radius: 2px; background: var(--sunk);"></span>')
    lab = ""
    if labels:
        lab = ('<div style="position: relative; height: 20px; margin-top: 10px;">' + "".join(
            f'<span style="position: absolute; {"left: -8px;" if j == 0 else "right: -8px;" if j == 2 else f"left: {w / 2}px; transform: translateX(-50%);"} '
            f'font-size: 13.5px; white-space: nowrap; {"font-weight: 650; color: var(--fg);" if j == i else "color: var(--faint);"}">{t}</span>'
            for j, (_, t, _, _, _) in enumerate(FEEL)) + '</div>')
    return (f'<div style="width: {w}px; margin: 0 auto;"><div style="position: relative; height: {thumb}px;">{track}{stops}{knob}</div>{lab}</div>')


def rank_how(active="loved"):
    _, label, rng, filt, glow = [f for f in FEEL if f[0] == active][0]
    inner = ('<div style="text-align: center; padding: 6px 20px 0;">'
             '<div style="font-size: 13px; font-weight: 600; color: var(--muted);">Adrian Tropical &#183; Dominican &#183; Bella Vista</div>'
             f'<div style="font-family: {SERIF}; font-size: 34px; line-height: 1; margin-top: 6px;">How was it?</div></div>'
             f'<div style="width: 236px; height: 236px; margin: 22px auto 0; border-radius: 40px; overflow: hidden; box-shadow: {glow};">'
             f'{img("mofongo", f" filter: {filt};")}</div>'
             f'<div style="text-align: center; margin-top: 22px; font-family: {SERIF}; font-size: 58px; line-height: 1;">{label}</div>'
             f'<div style="text-align: center; font-size: 13px; color: var(--muted); margin-top: 6px;">Places it between {rng} on your list</div>'
             f'<div style="margin-top: 26px;">{feel_slider(active)}</div>')
    foot = ('<div style="position: absolute; left: 16px; right: 16px; bottom: 30px; height: 64px; border-radius: 32px; background: var(--chip); '
            'box-shadow: var(--lift); display: flex; align-items: center; padding: 0 6px 0 22px; z-index: 60;">'
            f'<span style="flex: 1; display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: var(--fg2);">{ic("pencil", 16, 2)}Add a note</span>'
            f'<span style="height: 52px; padding: 0 22px; border-radius: 26px; background: var(--solid); color: var(--on-solid); display: flex; '
            f'align-items: center; gap: 8px; font-size: 15.5px; font-weight: 650;">Next{ic("arrow", 17, 2.2)}</span></div>')
    return A.rank_step("", inner) + foot


def rank_dish():
    """What you ordered — each dish gets the same slider, small."""
    inner = ('<div style="display: flex; justify-content: space-between; padding: 0 16px;">' + btn("back", 38, "chip", "Back")
             + '<span style="font-size: 15px; font-weight: 650; align-self: center;">Done</span></div>'
             + A.neighbors([("20", "Adrian Tropical", "9.3", True), ("21", "&Aacute;ndale", "9.3", False)])
             + A.section_label("What did you order?") + f'<div style="padding: 0 16px;">{field("Search or add a dish&hellip;", icon="search")}</div>'
             + '<div style="display: flex; gap: 8px; padding: 12px 16px 0;">' + pill("Mofongo de camarones", True, h=32) + '</div>'
             + card(f'<div style="display: flex; align-items: center; justify-content: space-between;"><span style="font-family: {SERIF}; font-size: 22px;">Mofongo de camarones</span>'
                    f'<span style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted);">{ic("check", 14, 2.2)}Saved</span></div>'
                    + f'<div style="margin-top: 16px;">{feel_slider("loved", 281, 40)}</div>'
                    '<div style="margin-top: 14px; height: 56px; border-radius: 18px; border: 1.5px dashed var(--line); display: flex; align-items: center; '
                    f'justify-content: center; gap: 8px; font-size: 14.5px; color: var(--fg2);">{ic("camera", 18, 1.9)}Add a photo</div>', "16px", "12px 16px 0"))
    return A.feed_scrolled() + sheet(inner, 66, None)
