"""Feed, Explore, restaurant, rank flow, Your list — every screen returns theme-agnostic HTML."""
from mesa_ui import (ELL, GL, PGL, SERIF, UI, avatar, btn, card, cta, empty, eyebrow, field, ic, img, large_title,
                     map_svg, menu, name_card, pill, pills, rank_bar, scrim, score_pill, search_bar, section, sheet,
                     stack, tabbar, thumb, toast, top_nav, ttext, word)

TOP = '<div style="height: 58px;"></div>'


def score_stack(score, size=24):
    """Number over its word, right-aligned — the compact form of pick 07 for dense rows."""
    return (f'<div style="text-align: right; flex-shrink: 0; min-width: 52px;">'
            f'<div style="font-family: {SERIF}; font-size: {size}px; line-height: 1;">{score}</div>'
            f'<div style="font-size: 11px; font-weight: 650; color: var(--accent-text); margin-top: 3px;">{word(score)}</div></div>')


# ================================================================ FEED

def feed_header(greeting=True):
    head = ('<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">'
            + avatar("E", 42, 0) +
            '<div style="display: flex; gap: 8px;">' + btn("search", 42, "chip", "Search") +
            '<span style="position: relative; display: flex;">' + btn("bell", 42, "chip", "Activity") +
            '<span style="position: absolute; top: 9px; right: 11px; width: 8px; height: 8px; border-radius: 50%; '
            'background: var(--accent); box-shadow: 0 0 0 2px var(--chip);"></span></span></div></div>')
    g = (f'<div style="padding: 16px 20px 16px;"><div style="font-family: {SERIF}; font-size: 33px; line-height: 1.02;">'
         'Good evening, Enrique</div><div style="font-size: 14.5px; color: var(--muted); margin-top: 6px;">'
         'Where are we going tonight?</div></div>') if greeting else '<div style="height: 14px;"></div>'
    return TOP + head + g


FEED_PILLS = ["For you", "Friends", "Popular", "Events", "Lists"]


def six_tile(photo, name, reason):
    t = (f'<div style="width: 58px; height: 62px; flex-shrink: 0; overflow: hidden;">{img(photo)}</div>' if photo else
         f'<div style="width: 58px; height: 62px; flex-shrink: 0; background: var(--card2); display: flex; align-items: center; '
         f'justify-content: center; text-align: center; font-family: {SERIF}; font-size: 12px; line-height: 1; padding: 4px; '
         f'box-sizing: border-box; box-shadow: inset -1px 0 0 var(--line);">{name}</div>')
    return (f'<div style="display: flex; align-items: center; gap: 10px; height: 62px; border-radius: 18px; overflow: hidden; '
            f'background: var(--card); box-shadow: var(--lift); min-width: 0;">{t}'
            f'<div style="min-width: 0; padding-right: 8px;"><div style="font-family: {SERIF}; font-size: 16.5px; line-height: 1.05; {ELL}">{name}</div>'
            f'<div style="font-size: 11.5px; color: var(--muted); margin-top: 3px; {ELL}">{reason}</div></div></div>')


def your_six():
    tiles = [("branzino", "O.Livia", "Diego &#183; 9.6"), ("ceviche", "Segundo Muelle", "Saved &#183; 2 friends"),
             ("tapas", "Lul&uacute; Tasting Bar", "Open till 1 AM"), (None, "Forno Bravo", "You saved it"),
             ("dessert", "Positano", "Luc&iacute;a&rsquo;s new #1"), ("bar", "Vesuvio Sarasota", "3 friends this week")]
    return (section("Your six", "Why these?", pad="22px 20px 12px") +
            '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 0 16px;">'
            + "".join(six_tile(*t) for t in tiles) + '</div>')


EVENTS = [
    dict(p="ceviche", place="Samurai", hood="Piantini", title="Aniversario:<br>Omakase Especial", flat="Aniversario: Omakase Especial",
         time="7 PM", going="3 friends going", who="DLN", day="Fri", date="2", mon="Oct", cat="Special", catv="--cat-food",
         price="Set menu RD$3,500"),
    dict(p="tapas", place="Lul&uacute; Tasting Bar", hood="Zona Colonial", title="Men&uacute; degustaci&oacute;n<br>a ciegas",
         flat="Men&uacute; degustaci&oacute;n a ciegas", time="8 PM", going="2 friends going", who="VC", day="Sat", date="3",
         mon="Oct", cat="Food tasting", catv="--cat-food", price="RD$3,900"),
    dict(p="wine", place="Pura Tasca", hood="Gazcue", title="Cata de vinos<br>de Rioja", flat="Cata de vinos de Rioja",
         time="7 PM", going="1 friend going", who="I", day="Wed", date="30", mon="Sep", cat="Tasting", catv="--cat-cata",
         price="RD$2,200"),
]


def tonight_card(e, w=252, h=330):
    return (f'<div style="width: {w}px; height: {h}px; border-radius: 30px; overflow: hidden; position: relative; flex-shrink: 0;">'
            + img(e["p"]) + scrim() +
            f'<div style="position: absolute; top: 10px; left: 10px; right: 10px; height: 48px; border-radius: 24px; {PGL} '
            'display: flex; align-items: center; gap: 9px; padding: 0 5px 0 5px; box-sizing: border-box;">'
            f'<div style="width: 38px; height: 38px; border-radius: 50%; overflow: hidden; flex-shrink: 0;">{img(e["p"])}</div>'
            f'<div style="flex: 1; min-width: 0;"><div style="font-size: 14px; font-weight: 650; {ELL}">{e["place"]}</div>'
            f'<div style="font-size: 11.5px; opacity: 0.75;">{e["hood"]}</div></div>' + btn("bookmark", 38, "photo", "Save") + '</div>'
            '<div style="position: absolute; left: 18px; right: 18px; bottom: 18px; color: #f5efe4;">'
            f'<div style="font-family: {SERIF}; font-size: 31px; line-height: 0.98;">{e["title"]}</div>'
            '<div style="display: flex; align-items: center; gap: 9px; margin-top: 13px;">'
            f'<span style="height: 26px; padding: 0 11px; border-radius: 13px; background: var(--accent); color: var(--on-accent); '
            f'font-size: 12px; font-weight: 700; display: flex; align-items: center;">{e["time"]}</span>'
            f'<span style="font-size: 12.5px; opacity: 0.85; flex: 1;">{e["going"]}</span>'
            + stack(e["who"], 22, "rgba(0,0,0,0.4)") + '</div></div></div>')


def tonight_row():
    return (section("Tonight", "3 events", pad="26px 20px 12px") +
            f'<div style="display: flex; gap: 12px; padding: 0 20px; overflow: hidden;">{tonight_card(EVENTS[0])}{tonight_card(EVENTS[1])}</div>')


FRIENDS = [
    dict(p="branzino", place="O.Livia", hood="Piantini", who="Diego Read", t=0, when="2h", note="El pargo entero. No hay discusi&oacute;n.",
         score="9.6", cheers=4, comments=2),
    dict(p="bar", place="Vesuvio Sarasota", hood="Bella Vista", who="Valentina P&eacute;rez", t=2, when="5h",
         note="Pizza al horno de le&ntilde;a como debe ser.", score="8.4", cheers=2, comments=0),
    dict(p=None, place="Forno Bravo &ndash; Naco", hood="Naco", who="Luc&iacute;a Fern&aacute;ndez", t=1, when="1d",
         note="La burrata vale el viaje a Naco.", score="9.1", cheers=6, comments=1),
    dict(p="ceviche", place="Segundo Muelle", hood="Naco", who="Natalia Cruz", t=3, when="1d", note="El tiradito, sin discusi&oacute;n.",
         score="9.0", cheers=3, comments=1),
    dict(p=None, place="Cyril Restaurante", hood="Piantini", who="Isabela Guerrero", t=4, when="2d", note=None, score="8.7",
         cheers=1, comments=0),
    dict(p="mofongo", place="Adrian Tropical", hood="Bella Vista", who="Rafael Then", t=5, when="3d",
         note="Mofongo de camarones y la vista al malec&oacute;n.", score="7.9", cheers=2, comments=0),
]


def social_line(d):
    return (f'<div style="display: flex; align-items: center; gap: 12px; margin-top: 7px; font-size: 12px; color: var(--muted);">'
            f'<span style="display: flex; align-items: center; gap: 4px;">{ic("heart", 14, 1.9)}{d["cheers"]}</span>'
            f'<span style="display: flex; align-items: center; gap: 4px;">{ic("comment", 14, 1.9)}{d["comments"]}</span>'
            f'<span style="display: flex; margin-left: auto; margin-right: 2px;">{ic("bookmark", 14, 1.9)}</span></div>')


def friend_card(d):
    """Pick 05 B. No photo: their words become the picture (06 D); no words either: the name card (06 A)."""
    first = d["who"].split(" ")[0]
    meta = (f'<div style="display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--muted);">'
            f'{avatar(first[0], 20, d["t"])}<span style="color: var(--fg); font-weight: 600;">{first}</span>&#183; {d["when"]}</div>')
    if d["p"]:
        return ('<div style="position: relative; height: 112px; margin: 0 16px 10px; border-radius: 24px; background: var(--card); '
                'box-shadow: var(--lift); overflow: hidden;">'
                f'<div style="position: absolute; right: 0; top: 0; bottom: 0; width: 128px;">{img(d["p"])}</div>'
                '<div style="position: absolute; right: 0; top: 0; bottom: 0; width: 128px; '
                'background: linear-gradient(to right, var(--card) 0%, rgba(0,0,0,0) 62%);"></div>'
                f'<span style="position: absolute; top: 10px; right: 10px;">{score_pill(d["score"], "photo", 12)}</span>'
                '<div style="position: absolute; left: 16px; right: 136px; top: 13px;">' + meta +
                f'<div style="font-family: {SERIF}; font-size: 21px; line-height: 1.05; margin-top: 6px; {ELL}">{d["place"]}</div>'
                f'<div style="font-size: 13px; color: var(--fg2); margin-top: 3px; {ELL}">{d["note"] or d["hood"]}</div>'
                + social_line(d) + '</div></div>')
    if d["note"]:
        return ('<div style="margin: 0 16px 10px; padding: 13px 16px 12px; border-radius: 24px; background: var(--card); box-shadow: var(--lift);">'
                f'<div style="display: flex; align-items: center; justify-content: space-between;">{meta}{score_pill(d["score"], "chip", 12)}</div>'
                f'<div style="font-family: {SERIF}; font-size: 22px; line-height: 1.12; margin-top: 8px;">&ldquo;{d["note"]}&rdquo;</div>'
                f'<div style="font-size: 13px; color: var(--muted); margin-top: 4px;">at <span style="color: var(--fg);">{d["place"]}</span> &#183; {d["hood"]}</div>'
                + social_line(d) + '</div>')
    return ('<div style="position: relative; height: 112px; margin: 0 16px 10px; border-radius: 24px; background: var(--card); '
            'box-shadow: var(--lift); overflow: hidden;">'
            f'<div style="position: absolute; right: 8px; top: 8px; bottom: 8px; width: 112px;">'
            f'{name_card(d["place"], 96, 18, 17).replace("width: 96px; height: 96px;", "width: 112px; height: 96px;")}</div>'
            '<div style="position: absolute; left: 16px; right: 136px; top: 13px;">' + meta +
            f'<div style="font-family: {SERIF}; font-size: 21px; line-height: 1.05; margin-top: 6px; {ELL}">{d["place"]}</div>'
            f'<div style="display: flex; margin-top: 5px;">{score_pill(d["score"], "chip", 12)}</div>' + social_line(d) + '</div></div>')


def feed_for_you():
    return feed_header() + pills(FEED_PILLS) + your_six() + tonight_row() + tabbar("feed")


def pinned(title_pills, active=0):
    return (f'<div style="position: absolute; top: 0; left: 0; right: 0; padding: 58px 0 12px; z-index: 30; {GL} border-width: 0 0 1px 0;">'
            + pills(title_pills, active) + '</div>')


def feed_scrolled():
    body = ('<div style="height: 118px;"></div>' + section("From your friends", "Newest first", pad="4px 20px 12px")
            + "".join(friend_card(d) for d in FRIENDS[:3])
            + '<div style="display: flex; align-items: center; gap: 10px; padding: 10px 24px 14px; color: var(--muted); font-size: 13px;">'
            '<span style="flex: 1; height: 1px; background: var(--line);"></span>You&rsquo;re caught up &#183; older below'
            '<span style="flex: 1; height: 1px; background: var(--line);"></span></div>'
            + friend_card(FRIENDS[3]) + friend_card(FRIENDS[4]))
    return body + pinned(FEED_PILLS) + tabbar("feed")


def person_tile(letter, tone, name, sub):
    return (f'<div style="width: 138px; flex-shrink: 0; border-radius: 24px; background: var(--card); box-shadow: var(--lift); '
            f'padding: 16px 12px 12px; box-sizing: border-box; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px;">'
            + avatar(letter, 56, tone) +
            f'<div style="font-family: {SERIF}; font-size: 18px; line-height: 1.05; margin-top: 4px;">{name}</div>'
            f'<div style="font-size: 11.5px; color: var(--muted); line-height: 1.3;">{sub}</div>'
            + cta("Follow", "solid", h=34, size=13, grow=False) + '</div>')


def feed_shelf():
    body = ('<div style="height: 118px;"></div>' + friend_card(FRIENDS[5])
            + section("People you may know", "See all", pad="16px 20px 12px")
            + '<div style="display: flex; gap: 10px; padding: 0 16px; overflow: hidden;">'
            + person_tile("M", 3, "Manuel Reyes", "Followed by Isabela") + person_tile("L", 4, "Luis Castillo", "Followed by Luc&iacute;a")
            + person_tile("E", 2, "Emil Cordero", "12 spots in common") + '</div>'
            + section("New near you", None, pad="24px 20px 12px")
            + '<div style="display: flex; gap: 10px; padding: 0 16px; overflow: hidden;">'
            + "".join(f'<div style="width: 150px; flex-shrink: 0;"><div style="height: 120px; border-radius: 22px; overflow: hidden; position: relative;">'
                      f'{img(p) if p else ""}{"" if p else name_card(n, 150, 22, 20).replace("width: 150px; height: 150px;", "width: 150px; height: 120px;")}'
                      f'<span style="position: absolute; top: 8px; left: 8px; height: 22px; padding: 0 8px; border-radius: 11px; {PGL} font-size: 11px; '
                      f'font-weight: 650; display: flex; align-items: center;">New</span></div>'
                      f'<div style="font-family: {SERIF}; font-size: 17px; margin-top: 7px; {ELL}">{n}</div>'
                      f'<div style="font-size: 12px; color: var(--muted);">{h}</div></div>'
                      for p, n, h in [("pizza", "Pizzarelli", "Pizza &#183; Bella Vista"), (None, "Nonna Julia", "Pizza &#183; Piantini"),
                                      ("cocktails", "Sophia&rsquo;s", "Bar &#183; Piantini")]) + '</div>')
    return body + pinned(FEED_PILLS) + tabbar("feed")


def feed_end():
    body = ('<div style="height: 118px;"></div>' + friend_card(FRIENDS[4]) + friend_card(FRIENDS[5])
            + '<div style="margin: 14px 16px 0; padding: 26px 22px 22px; border-radius: 28px; background: var(--card); box-shadow: var(--lift); text-align: center;">'
            f'<div style="font-family: {SERIF}; font-size: 28px; line-height: 1.05;">That&rsquo;s everything<br>your friends ranked.</div>'
            '<div style="font-size: 14px; color: var(--muted); margin-top: 8px; line-height: 1.45;">Find what the rest of Santo Domingo loves, '
            'or bring more friends to the table.</div>'
            '<div style="display: flex; gap: 8px; margin-top: 18px;">' + cta("See Popular", "solid", h=46, size=15)
            + cta("Find friends", "chip", h=46, size=15) + '</div></div>')
    return body + pinned(FEED_PILLS) + tabbar("feed")


def pop_row(n, photo, name, meta, score, friend=None, new=False):
    f = f'<div style="font-size: 12px; color: var(--fg2); margin-top: 3px; {ELL}">{friend}</div>' if friend else ""
    nw = ('<span style="height: 18px; padding: 0 7px; border-radius: 9px; background: var(--accent); color: var(--on-accent); '
          'font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; margin-left: 6px; vertical-align: 3px;">New</span>') if new else ""
    return (f'<div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; margin: 0 20px; border-bottom: 1px solid var(--line);">'
            f'<span style="font-family: {SERIF}; font-size: 22px; width: 24px; color: var(--muted); flex-shrink: 0;">{n}</span>'
            + thumb(photo, name, 54, 16) +
            f'<div style="flex: 1; min-width: 0;"><div style="font-family: {SERIF}; font-size: 19px; line-height: 1.05; {ELL}">{name}{nw}</div>'
            f'<div style="font-size: 12.5px; color: var(--muted); margin-top: 3px; {ELL}">{meta}</div>{f}</div>' + score_stack(score, 22) + '</div>')


def feed_popular():
    rows = [("branzino", "O.Livia", "Mediterranean &#183; Piantini", "9.6", "Diego ranked it 9.6"),
            ("ceviche", "Segundo Muelle", "Peruvian &#183; Naco", "9.0", "Natalia and 1 other"),
            ("tapas", "Lul&uacute; Tasting Bar", "Tapas &#183; Zona Colonial", "9.0", None),
            ("steak", "El Mes&oacute;n de la Cava", "Steakhouse &#183; Serrall&eacute;s", "8.8", "Rafael ranked it 9.4"),
            (None, "LILA &ndash; Modern Cuisine", "Contemporary &#183; Piantini", "8.8", None, True),
            ("bar", "Vesuvio Sarasota", "Italian &#183; Bella Vista", "8.6", "3 friends"),
            ("cocktails", "Sophia&rsquo;s Bar &amp; Grill", "Contemporary &#183; Piantini", "8.5", None)]
    body = (feed_header(False) + pills(FEED_PILLS, 2) +
            '<div style="display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 4px;">'
            f'<div><div style="font-family: {SERIF}; font-size: 30px; line-height: 1;">Popular this week</div>'
            '<div style="font-size: 13px; color: var(--muted); margin-top: 5px;">Santo Domingo &#183; rankings in the last 7 days</div></div></div>'
            + pills(["All", "Piantini", "Naco", "Bella Vista", "Zona Colonial"], 0, pad="12px 20px 6px", h=32)
            + "".join(pop_row(i + 1, *r) for i, r in enumerate(rows)))
    return body + tabbar("feed")


def list_cover(photo, title, sub, by, w=353, h=210):
    return (f'<div style="position: relative; width: {w}px; height: {h}px; border-radius: 28px; overflow: hidden; flex-shrink: 0;">'
            + img(photo) + scrim() +
            f'<span style="position: absolute; top: 12px; left: 12px; height: 26px; padding: 0 11px; border-radius: 13px; {PGL} '
            f'font-size: 12px; font-weight: 650; display: flex; align-items: center;">{sub}</span>'
            '<div style="position: absolute; left: 18px; right: 18px; bottom: 16px; color: #f5efe4;">'
            f'<div style="font-family: {SERIF}; font-size: 30px; line-height: 1;">{title}</div>'
            f'<div style="font-size: 13px; opacity: 0.8; margin-top: 5px;">{by}</div></div></div>')


def feed_lists():
    body = (feed_header(False) + pills(FEED_PILLS, 4) + section("Featured", None, pad="20px 20px 12px")
            + f'<div style="padding: 0 20px;">{list_cover("bar", "La Dolce Vita", "8 of 9 ranked", "Pasta, pizza y vino tinto &#183; by @greciaeats")}</div>'
            + '<div style="display: flex; gap: 10px; padding: 12px 20px 0;">'
            + list_cover("branzino", "Piantini After Dark", "9 of 12", "by Mesa", 172, 190)
            + list_cover("steak", "Mesa Best &#183; DR 2026", "10 of 25", "by Mesa", 172, 190) + '</div>'
            + section("From your friends", None, pad="24px 20px 12px")
            + card('<div style="display: flex; align-items: center; gap: 12px;">' + thumb("pasta", "", 56, 16)
                   + ttext("Pasta night", "by Luc&iacute;a &#183; 6 spots", None, 19) + btn("chev_r", 32, "ghost") + '</div>', "12px"))
    return body + tabbar("feed")


# ---------------------------------------------------------------- activity + comments

def act_row(letter, tone, text, when, photo):
    return (f'<div style="display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--line);">'
            + avatar(letter, 40, tone) +
            f'<div style="flex: 1; min-width: 0; font-size: 14.5px; line-height: 1.38;">{text}'
            f'<div style="font-size: 12.5px; color: var(--muted); margin-top: 3px;">{when}</div></div>'
            + thumb(photo, "", 46, 14) + '</div>')


def activity():
    b = lambda t: f'<span style="font-weight: 650;">{t}</span>'
    sc = lambda t: f'<span style="font-family: {SERIF}; font-size: 17px;">{t}</span>'
    follow = cta("Follow back", "solid", h=32, size=12.5, grow=False)
    today = [act_row("D", 0, f'{b("Diego Read")} cheered your rank of {b("O.Livia")}', "12m", "branzino"),
             act_row("L", 1, f'{b("Luc&iacute;a Fern&aacute;ndez")} started following you', "1h", None).replace(thumb(None, "", 46, 14), follow)]
    earlier = [act_row("D", 0, f'{b("Diego Read")} ranked {b("Boga Boga")} {sc("9.2")} &mdash; liked it more than you did', "1w", "branzino"),
               act_row("D", 0, f'{b("Diego Read")} ranked {b("Adrian Tropical")} {sc("7.2")} &mdash; you liked it more', "1w", "mofongo"),
               act_row("V", 2, f'{b("Valentina P&eacute;rez")} ranked {b("Vesuvio Sarasota")} {sc("8.4")}', "1w", "bar"),
               act_row("N", 3, f'{b("Natalia Cruz")} tried {b("Segundo Muelle")}, one of your saved spots', "2w", "ceviche")]
    return (top_nav() + large_title("Activity", top=112) + pills(["All", "Followers", "Rankings", "Plans"], 0, pad="16px 20px 0")
            + '<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding: 20px 20px 2px;">Today</div>'
            + '<div style="padding: 0 20px;">' + "".join(today) + '</div>'
            + '<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding: 18px 20px 2px;">Earlier</div>'
            + '<div style="padding: 0 20px;">' + "".join(earlier) + '</div>')


def activity_empty():
    return (top_nav() + large_title("Activity", top=112) + pills(["All", "Followers", "Rankings", "Plans"], 3, pad="16px 20px 0")
            + empty("Quiet for now.", "Cheers, new followers, and friends trying your saved spots show up here.", "Discover people", 70))


def comments():
    def c(letter, tone, name, when, text):
        return (f'<div style="display: flex; gap: 12px; padding: 12px 20px;">{avatar(letter, 38, tone)}'
                f'<div style="flex: 1;"><div style="font-size: 14px;"><span style="font-weight: 650;">{name}</span> '
                f'<span style="color: var(--muted);">{when}</span></div>'
                f'<div style="font-size: 15px; line-height: 1.4; margin-top: 2px;">{text}</div></div>'
                f'<span style="color: var(--faint);">{ic("more", 18)}</span></div>')
    inner = ('<div style="display: flex; gap: 12px; padding: 4px 20px 14px; border-bottom: 1px solid var(--line);">' + avatar("D", 40, 0) +
             f'<div style="flex: 1;"><div style="font-size: 14.5px;"><span style="font-weight: 650;">Diego</span> ranked '
             f'<span style="font-weight: 650;">O.Livia</span></div>'
             f'<div style="font-family: {SERIF}; font-size: 19px; line-height: 1.15; margin-top: 4px;">&ldquo;El pargo entero. No hay discusi&oacute;n.&rdquo;</div></div>'
             + score_pill("9.6", "chip", 12) + '</div>'
             + c("V", 2, "Valentina", "1h", "Fuimos el s&aacute;bado, confirmo todo.")
             + c("E", 0, "Enrique", "40m", "&iquest;Reservaste o llegaste sin reserva?")
             + c("D", 0, "Diego", "12m", "Reserv&eacute;. Pide mesa en la terraza.")
             + '<div style="position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 14px 30px; border-top: 1px solid var(--line); '
             'background: var(--bg); display: flex; align-items: center; gap: 10px;">' + avatar("E", 34, 0) +
             '<div style="flex: 1; height: 42px; border-radius: 21px; background: var(--card); box-shadow: var(--lift); display: flex; '
             'align-items: center; padding: 0 16px; color: var(--faint); font-size: 15px;">Write a comment&hellip;</div>'
             + btn("send", 40, "accent", "Send") + '</div>')
    return feed_scrolled() + sheet(inner, 110, "Comments")


# ================================================================ EXPLORE

def place_row(n, photo, name, meta, score, friends=None):
    f = f'<div style="font-size: 12px; color: var(--fg2); margin-top: 3px;">{friends}</div>' if friends else ""
    return ('<div style="display: flex; align-items: center; gap: 12px; margin: 0 16px 8px; padding: 10px 14px 10px 12px; border-radius: 22px; '
            'background: var(--card); box-shadow: var(--lift);">'
            f'<span style="font-family: {SERIF}; font-size: 19px; width: 16px; color: var(--muted); text-align: center; flex-shrink: 0;">{n}</span>'
            + thumb(photo, name, 54, 16) +
            f'<div style="flex: 1; min-width: 0;"><div style="font-family: {SERIF}; font-size: 19px; line-height: 1.05; {ELL}">{name}</div>'
            f'<div style="font-size: 12.5px; color: var(--muted); margin-top: 3px; {ELL}">{meta}</div>{f}</div>' + score_stack(score, 22) + '</div>')


EXPLORE_ROWS = [("branzino", "O.Livia", "Mediterranean &#183; Piantini &#183; $$$$", "9.6", "1 friend"),
                ("ceviche", "Segundo Muelle", "Peruvian &#183; Naco &#183; $$$", "9.0", "2 friends"),
                ("tapas", "Lul&uacute; Tasting Bar", "Tapas &#183; Zona Colonial &#183; $$", "9.0", "5 friends"),
                ("steak", "El Mes&oacute;n de la Cava", "Steakhouse &#183; Serrall&eacute;s", "8.8", "3 friends"),
                ("bar", "Vesuvio Sarasota", "Italian &#183; Bella Vista &#183; $$$", "8.8", "3 friends"),
                ("cocktails", "Sophia&rsquo;s Bar &amp; Grill", "Contemporary &#183; Piantini", "8.8", None)]


def explore_head(active=0):
    return (TOP + large_title("Explore", top=4, right=btn("map", 42, "chip", "Map")) +
            f'<div style="padding: 14px 16px 0;">{search_bar("Search a spot, dish, or member")}</div>'
            + pills(["Places", "Events"], active, pad="14px 20px 0"))


def explore_places(open_now=False):
    chips = ('<div style="display: flex; gap: 8px; padding: 12px 20px 14px; overflow: hidden;">'
             + pill("Score", icon="sort", chevron=True, h=34) + pill("Filters", icon="sliders", h=34)
             + pill("Open now", open_now, h=34) + pill("Neighborhood", chevron=True, h=34) + '</div>')
    trend = (section("Trending this week", None, pad="4px 20px 10px", size=18)
             + '<div style="display: flex; gap: 10px; padding: 0 16px 14px; overflow: hidden;">'
             + "".join(f'<div style="width: 132px; flex-shrink: 0;"><div style="height: 104px; border-radius: 20px; overflow: hidden; position: relative;">{img(p)}'
                       f'<span style="position: absolute; left: 8px; bottom: 8px; height: 22px; padding: 0 8px; border-radius: 11px; {PGL} font-size: 11px; '
                       f'font-weight: 650; display: flex; align-items: center; gap: 4px;">{ic("flame", 12, 2)}{c}</span></div>'
                       f'<div style="font-family: {SERIF}; font-size: 16.5px; margin-top: 6px; {ELL}">{n}</div></div>'
                       for p, n, c in [("tapas", "Lul&uacute; Tasting Bar", 14), ("ceviche", "Segundo Muelle", 11), ("cocktails", "Sophia&rsquo;s", 9)]) + '</div>')
    return explore_head() + chips + trend + "".join(place_row(i + 1, *r) for i, r in enumerate(EXPLORE_ROWS[:3])) + tabbar("explore")


def explore_sort():
    return explore_places() + menu(["Score", "Name", "Distance"], 0, top=268, left=20, width=220, title="Sort by")


def explore_filters():
    rows = [("Price", "Any"), ("Minimum score", "All"), ("Neighborhood", "Any"), ("Cuisine", "Any"), ("Occasion", "Date night")]
    body = ('<div style="margin: 4px 16px 0; border-radius: 22px; background: var(--card); box-shadow: var(--lift); overflow: hidden;">'
            + "".join(f'<div style="display: flex; align-items: center; justify-content: space-between; height: 56px; margin-left: 16px; '
                      f'padding-right: 16px; {"border-top: 1px solid var(--line);" if i else ""} font-size: 16px;">{k}'
                      f'<span style="display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 15px;">{v}{ic("chev_r", 15, 2)}</span></div>'
                      for i, (k, v) in enumerate(rows)) + '</div>'
            + '<div style="position: absolute; left: 16px; right: 16px; bottom: 34px; display: flex; gap: 10px;">'
            + cta("Clear", "chip") + cta("Show 38 places", "solid") + '</div>')
    return explore_places() + sheet(body, 400, "Filters")


def section_label(t):
    return f'<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding: 18px 20px 8px;">{t}</div>'


def explore_search():
    def spot(n, photo, name, sub, right):
        return (f'<div style="display: flex; align-items: center; gap: 12px; margin: 0 16px 8px; padding: 10px 14px 10px 12px; border-radius: 22px; '
                f'background: var(--card); box-shadow: var(--lift);"><span style="font-family: {SERIF}; font-size: 19px; width: 16px; color: var(--muted); '
                f'text-align: center;">{n}</span>{thumb(photo, name, 50, 15)}{ttext(name, sub, None, 18)}{right}</div>')
    be_first = '<span style="font-size: 11.5px; font-weight: 700; color: var(--fg);">Be the first</span>'
    body = (TOP + '<div style="display: flex; align-items: center; gap: 10px; padding: 0 16px;">'
            '<div style="flex: 1; height: 46px; border-radius: 23px; background: var(--chip); box-shadow: var(--lift); display: flex; '
            f'align-items: center; gap: 10px; padding: 0 16px; font-size: 16px;">{ic("search", 18, 2)}pizza<span style="width: 2px; height: 20px; '
            'background: var(--fg); margin-left: -8px;"></span></div><span style="font-size: 16px; font-weight: 550;">Cancel</span></div>'
            + pills(["Places", "Events"], 0, pad="14px 20px 0")
            + '<div style="display: flex; gap: 8px; padding: 12px 20px 0; overflow: hidden;">' + pill("Score", icon="sort", chevron=True, h=34)
            + pill("Filters &#183; 1", True, icon="sliders", h=34) + pill("Naco &#215;", h=34) + '</div>'
            + section_label("Members")
            + f'<div style="display: flex; align-items: center; gap: 12px; margin: 0 16px 8px; padding: 10px 14px 10px 12px; border-radius: 22px; background: var(--card); box-shadow: var(--lift);">{avatar("P", 44, 2)}'
            + ttext("Pizza Club SDQ", "@pizzaclub &#183; 48 ranked &#183; Naco", None, 18) + cta("Follow", "solid", h=32, size=12.5, grow=False) + '</div>'
            + section_label("Spots")
            + spot(1, None, "Detroit Pizza", "Pizza &#183; Naco &#183; $$", score_stack("9.5", 20))
            + spot(2, "pizza", "Pizzarelli", "Pizza &#183; Naco &#183; $$", score_stack("7.7", 20))
            + spot(3, None, "Pizza Rustica", "Pizza &#183; Naco &#183; $", be_first)
            + section_label("On Google")
            + f'<div style="padding: 6px 20px; border-bottom: 1px solid var(--line);"><div style="font-family: {SERIF}; font-size: 18px;">Pizzer&iacute;a Il Cappo</div>'
            '<div style="font-size: 12.5px; color: var(--muted);">Av. Gustavo Mej&iacute;a Ricart 88, Naco</div></div>'
            '<div style="padding: 10px 20px; font-size: 11.5px; color: var(--faint);">Powered by Google</div>')
    return body


def date_cell(dow, d, active=False, dots=()):
    dd = "".join(f'<span style="width: 4px; height: 4px; border-radius: 50%; background: var({c});"></span>' for c in dots)
    look = "background: var(--solid); color: var(--on-solid);" if active else ""
    return (f'<div style="display: flex; flex-direction: column; align-items: center; gap: 5px; width: 44px; flex-shrink: 0;">'
            f'<span style="font-size: 11px; font-weight: 650; color: var(--muted);">{dow}</span>'
            f'<span style="width: 40px; height: 40px; border-radius: 50%; {look} display: flex; align-items: center; justify-content: center; '
            f'font-family: {SERIF}; font-size: 19px;">{d}</span><span style="display: flex; gap: 3px; height: 4px;">{dd}</span></div>')


def cat_pill(label, var, icon, active=False):
    if active:
        return pill(label, True, h=34)
    return (f'<span style="height: 34px; padding: 0 13px; border-radius: 17px; background: var(--chip); box-shadow: var(--lift); '
            f'font-size: 13.5px; font-weight: 600; display: flex; align-items: center; gap: 7px; flex-shrink: 0; white-space: nowrap;">'
            f'<span style="color: var({var}); display: flex;">{ic(icon, 15, 2)}</span>{label}</span>')


def ticket(e, spots=None):
    s = ""
    if spots:
        s = (f'<div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 8px;">'
             f'<span style="color: var({e["catv"]}); font-weight: 650;">{spots[0]} spots left</span>'
             f'<span style="color: var(--muted);">0/{spots[1]}</span></div>'
             '<div style="height: 4px; border-radius: 2px; background: var(--sunk); margin-top: 5px;"></div>')
    return ('<div style="display: flex; margin: 0 16px 10px; border-radius: 26px; background: var(--card); box-shadow: var(--lift); overflow: hidden;">'
            f'<div style="width: 84px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; '
            f'border-right: 1px dashed var(--line); color: var({e["catv"]});">'
            f'<span style="font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em;">{e["day"].upper()}</span>'
            f'<span style="font-family: {SERIF}; font-size: 38px; line-height: 1;">{e["date"]}</span>'
            f'<span style="font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em;">{e["mon"].upper()}</span>'
            f'<span style="font-size: 11px; color: var(--muted); margin-top: 4px;">{e["time"]}</span></div>'
            '<div style="flex: 1; min-width: 0; padding: 13px 14px 13px;">'
            f'<div style="display: flex; align-items: center; justify-content: space-between;"><span style="font-size: 12px; font-weight: 700; '
            f'color: var({e["catv"]}); display: flex; align-items: center; gap: 5px;">{ic("wine" if "cata" in e["catv"] else "feed", 13, 2)}{e["cat"]}</span>'
            '<span style="font-size: 11.5px; color: var(--muted);">In 5 days</span></div>'
            f'<div style="font-family: {SERIF}; font-size: 21px; line-height: 1.05; margin-top: 5px;">{e["flat"]}</div>'
            f'<div style="font-size: 12.5px; color: var(--muted); margin-top: 3px;">{e["place"]} &#183; {e["price"]}</div>{s}'
            '<div style="display: flex; align-items: center; gap: 8px; margin-top: 10px;">'
            f'<span style="flex: 1; font-size: 12px; color: var(--muted);">{e["going"]}</span>'
            + btn("bookmark", 34, "ghost", "Save") + cta("I&rsquo;m going", "solid", h=34, size=13, grow=False) + '</div></div></div>')


def explore_events():
    strip = ('<div style="display: flex; align-items: flex-end; gap: 2px; padding: 16px 12px 0; overflow: hidden;">'
             + f'<div style="width: 44px; display: flex; flex-direction: column; align-items: center; gap: 5px; flex-shrink: 0;"><span style="font-size: 11px; '
             f'color: var(--muted); font-weight: 650;">SEP</span>{btn("calendar", 40, "chip", "Pick a date")}<span style="height: 4px;"></span></div>'
             + date_cell("TODAY", "28", True) + date_cell("TUE", "29") + date_cell("WED", "30", False, ("--cat-cata",))
             + date_cell("THU", "1", False, ("--cat-food",)) + date_cell("FRI", "2", False, ("--cat-food",))
             + date_cell("SAT", "3", False, ("--cat-food", "--cat-musica")) + date_cell("SUN", "4") + '</div>')
    cats = ('<div style="display: flex; gap: 8px; padding: 12px 20px 4px; overflow: hidden;">' + cat_pill("All", "", "", True)
            + cat_pill("Tastings", "--cat-cata", "wine") + cat_pill("Food", "--cat-food", "feed") + cat_pill("Music", "--cat-musica", "music")
            + cat_pill("Brunch", "--cat-brunch", "sun") + '</div>')
    e = EVENTS[2]
    feat = ('<div style="position: relative; height: 230px; margin: 10px 16px 12px; border-radius: 30px; overflow: hidden;">' + img(e["p"]) + scrim() +
            f'<div style="position: absolute; top: 12px; left: 12px; width: 50px; height: 54px; border-radius: 16px; background: var(--cat-cata); color: #ffffff; '
            f'display: flex; flex-direction: column; align-items: center; justify-content: center;"><span style="font-family: {SERIF}; font-size: 24px; line-height: 1;">30</span>'
            '<span style="font-size: 10.5px; font-weight: 700;">SEP</span></div>'
            f'<span style="position: absolute; top: 14px; right: 14px; height: 28px; padding: 0 11px; border-radius: 14px; {PGL} font-size: 12px; font-weight: 650; '
            f'display: flex; align-items: center; gap: 5px;">{ic("wine", 13, 2)}Tasting</span>'
            '<div style="position: absolute; left: 18px; right: 18px; bottom: 16px; display: flex; align-items: flex-end; gap: 10px; color: #f5efe4;">'
            f'<div style="flex: 1;"><div style="font-size: 12px; opacity: 0.8;">In 2 days</div><div style="font-family: {SERIF}; font-size: 28px; line-height: 1; margin-top: 3px;">{e["flat"]}</div>'
            f'<div style="font-size: 12.5px; opacity: 0.8; margin-top: 4px;">Pura Tasca &#183; 7:00 PM</div></div>'
            f'<span style="height: 36px; padding: 0 14px; border-radius: 18px; {PGL} font-size: 13.5px; font-weight: 650; display: flex; align-items: center;">I&rsquo;m going</span></div></div>')
    return explore_head(1) + strip + cats + section_label("Featured") + feat + ticket(EVENTS[1], (16, 16)) + tabbar("explore")


def map_screen(toast_text=None):
    pins = [(60, 330, "9.6", True), (120, 380, "9.0", False), (200, 350, "8.8", False), (250, 430, "9.0", False),
            (300, 300, "8.4", False), (170, 470, "8.6", False), (90, 520, "7.9", False), (290, 520, "8.8", False)]
    p = "".join(
        f'<span style="position: absolute; left: {x}px; top: {y}px; height: 30px; padding: 0 10px; border-radius: 15px; '
        f'{"background: var(--solid); color: var(--on-solid);" if sel else "background: var(--card); color: var(--fg); box-shadow: 0 4px 12px rgba(0,0,0,0.18);"} '
        f'font-family: {SERIF}; font-size: 16px; display: flex; align-items: center; padding-top: 2px; box-sizing: border-box;">{s}</span>'
        for x, y, s, sel in pins)
    bottom = (f'<div style="position: absolute; left: 16px; right: 16px; bottom: 34px; border-radius: 28px; {GL} padding: 10px; z-index: 30; '
              'display: flex; gap: 12px; align-items: center; box-shadow: 0 14px 34px rgba(0,0,0,0.2);">' + thumb("branzino", "", 72, 20) +
              f'<div style="flex: 1; min-width: 0;"><div style="font-family: {SERIF}; font-size: 22px; line-height: 1;">O.Livia</div>'
              '<div style="font-size: 12.5px; color: var(--muted); margin-top: 4px;">Mediterranean &#183; Piantini &#183; 1.2 km</div>'
              f'<div style="margin-top: 7px; display: flex;">{score_pill("9.6", "chip", 12)}</div></div>' + btn("chev_r", 38, "chip") + '</div>')
    head = (f'<div style="position: absolute; top: 58px; left: 16px; right: 16px; display: flex; gap: 8px; z-index: 30;">' + btn("back", 44, "glass", "Back") +
            f'<div style="flex: 1; height: 44px; border-radius: 22px; {GL} display: flex; align-items: center; gap: 8px; padding: 0 16px; color: var(--muted); font-size: 15px;">'
            f'{ic("search", 17, 2)}17 spots your friends ranked</div>' + btn("locate", 44, "glass", "Locate me") + '</div>')
    t = toast(toast_text, 160) if toast_text else ""
    return f'<div style="position: absolute; inset: 0;">{map_svg(False, True)}</div>' + p + head + bottom + t


# ================================================================ RESTAURANT

def place_top():
    hero = ('<div style="position: relative; height: 410px;">' + img("branzino") +
            '<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 120px; background: linear-gradient(to bottom, rgba(0,0,0,0), var(--bg));"></div>'
            '<div style="position: absolute; top: 58px; left: 16px; right: 16px; display: flex; justify-content: space-between;">'
            + btn("back", 44, "photo", "Back") + '<div style="display: flex; gap: 8px;">' + btn("share", 44, "photo", "Share")
            + btn("bookmark", 44, "photo", "Save") + '</div></div></div>')
    tiles = "".join(
        f'<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; color: var(--fg2);">'
        f'{btn(i, 52, "chip", t)}{t}</div>' for i, t in [("menu", "Menu"), ("phone", "Call"), ("globe", "Website"), ("nav", "Directions")])
    friends = "".join(
        f'<div style="display: flex; align-items: center; gap: 10px; padding: 9px 0; {"border-top: 1px solid var(--line);" if i else ""}">'
        f'{avatar(l, 32, t)}<div style="flex: 1; min-width: 0;"><div style="font-size: 14px; font-weight: 600;">{n}</div>'
        f'<div style="font-family: {SERIF}; font-size: 16px; color: var(--fg2); {ELL}">&ldquo;{q}&rdquo;</div></div>{score_stack(s, 20)}</div>'
        for i, (l, t, n, q, s) in enumerate([("D", 0, "Diego Read", "El pargo entero. No hay discusi&oacute;n.", "9.6"),
                                             ("N", 3, "Natalia Cruz", "Terraza de noche, perfecto.", "8.1")]))
    body = (hero + '<div style="padding: 0 20px; margin-top: -26px; position: relative;">'
            '<div style="font-size: 13px; font-weight: 600; color: var(--muted);">Piantini &#183; Mediterranean &#183; $$$$</div>'
            f'<div style="font-family: {SERIF}; font-size: 44px; line-height: 1; margin-top: 4px;">O.Livia</div>'
            '<div style="display: flex; align-items: center; gap: 10px; margin-top: 12px;">' + score_pill("8.6", "solid", 17) +
            '<span style="font-size: 13.5px; color: var(--muted); line-height: 1.3;">20 ranked<br>3 friends</span></div>'
            '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px;">'
            + "".join(f'<span style="height: 28px; padding: 0 11px; border-radius: 14px; background: var(--chip); box-shadow: var(--lift); '
                      f'font-size: 12.5px; font-weight: 600; display: flex; align-items: center;">{t}</span>'
                      for t in ["Group dinner", "Outdoors", "Solo", "In Piantini After Dark"]) + '</div>'
            f'<div style="display: flex; justify-content: space-between; padding: 18px 8px 0;">{tiles}</div></div>'
            + section("Friends", "2 of 3", pad="20px 20px 6px") + f'<div style="padding: 0 20px;">{friends}</div>')
    return body + rank_bar("Rank again")


def place_more():
    head = (f'<div style="position: absolute; top: 0; left: 0; right: 0; padding: 58px 16px 10px; {GL} border-width: 0 0 1px 0; z-index: 30; '
            'display: flex; align-items: center; gap: 10px;">' + btn("back", 40, "chip", "Back") +
            f'<span style="flex: 1; font-family: {SERIF}; font-size: 22px;">Vesuvio Sarasota</span>' + score_pill("8.6", "chip", 13) + '</div>')
    stats = "".join(
        f'<div style="flex: 1; border-radius: 20px; background: var(--card); box-shadow: var(--lift); padding: 12px 12px 10px;">'
        f'<div style="font-family: {SERIF}; font-size: 28px; line-height: 1;">{v}</div>'
        f'<div style="font-size: 12px; color: var(--muted); margin-top: 4px;">{l}</div></div>'
        for v, l in [("8.8", "You &#183; #82"), ("8.4", "Friends"), ("8.6", "Everyone")])
    dish = lambda p, n, by: (f'<div style="width: 164px; flex-shrink: 0;"><div style="height: 150px; border-radius: 22px; overflow: hidden;">{img(p)}</div>'
                             f'<div style="font-family: {SERIF}; font-size: 19px; margin-top: 7px; {ELL}">{n}</div>'
                             f'<div style="display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; color: var(--muted);">'
                             f'by {by}{ic("heart", 16, 1.9)}</div></div>')
    notes = "".join(
        f'<div style="display: flex; gap: 12px; padding: 12px 0; {"border-top: 1px solid var(--line);" if i else ""}">{avatar(l, 38, t)}'
        f'<div style="flex: 1;"><div style="font-size: 14px; font-weight: 600;">{n}</div>'
        f'<div style="font-family: {SERIF}; font-size: 18px; line-height: 1.2; margin-top: 2px;">{q}</div></div>{score_stack(s, 20)}</div>'
        for i, (l, t, n, q, s) in enumerate([("N", 3, "Natalia Cruz", "&ldquo;Pizza y vino de la casa en la terraza.&rdquo;", "9.1"),
                                             ("E", 0, "You", "No note yet &mdash; add one", "8.8"),
                                             ("V", 2, "Valentina P&eacute;rez", "&ldquo;Pizza al horno de le&ntilde;a como debe ser.&rdquo;", "8.4")]))
    body = ('<div style="height: 124px;"></div>' + f'<div style="display: flex; gap: 8px; padding: 0 16px;">{stats}</div>'
            + section("Dishes", "+ Add a dish", pad="24px 20px 12px")
            + '<div style="display: flex; gap: 10px; padding: 0 20px; overflow: hidden;">' + dish("steak", "Steak", "you")
            + dish("pizza", "Margherita, wood-fired", "Valentina") + dish("pasta", "Cacio e pepe", "Diego") + '</div>'
            + section("What people say", None, pad="22px 20px 4px") + f'<div style="padding: 0 20px;">{notes}</div>')
    return body + head + rank_bar("Rank again")


def place_nophoto():
    hero = ('<div style="position: relative; height: 330px; overflow: hidden;">' + map_svg(True, True) +
            '<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 110px; background: linear-gradient(to bottom, rgba(0,0,0,0), var(--bg));"></div>'
            + top_nav(None, "back", ["share", "bookmark"], "glass") +
            f'<span style="position: absolute; left: 50%; top: 250px; transform: translateX(-50%); height: 30px; padding: 0 12px; border-radius: 15px; {GL} '
            'font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 6px; white-space: nowrap;">'
            f'{ic("image", 14, 2)}No photos yet &#183; add the first</span></div>')
    body = (hero + '<div style="padding: 0 20px; margin-top: -8px; position: relative;">'
            '<div style="font-size: 13px; font-weight: 600; color: var(--muted);">Piantini &#183; Contemporary &#183; $$</div>'
            f'<div style="font-family: {SERIF}; font-size: 44px; line-height: 1; margin-top: 4px;">Cyril Restaurante</div>'
            '<div style="display: flex; align-items: center; gap: 10px; margin-top: 12px;">' + score_pill("9.6", "solid", 17) +
            '<span style="font-size: 13.5px; color: var(--muted); line-height: 1.3;">#1 on your list<br>4 ranked</span></div>'
            '<div style="font-size: 14px; color: var(--fg2); margin-top: 14px; line-height: 1.45;">C. Gustavo Mej&iacute;a Ricart 54, Santo Domingo</div></div>'
            + section("Friends", None, pad="20px 20px 6px")
            + f'<div style="padding: 0 20px; display: flex; align-items: center; gap: 10px;">{avatar("I", 32, 4)}'
            f'<div style="flex: 1; font-size: 14px; font-weight: 600;">Isabela Guerrero</div>{score_stack("8.7", 20)}</div>')
    return body + rank_bar("Rank again")


def menu_screen():
    items = [("Arancini de Langosta", "Roull&eacute; de azafr&aacute;n / parmesano"), ("Dumplings de Escargot", "Perejil / ajo / estrag&oacute;n"),
             ("Coliflor a la Le&ntilde;a", "Duxelle / romero / ajo / grana padano"), ("Hongos Mixtos", "Hongos ostras / sunchokes / porcini"),
             ("Scallops al Sart&eacute;n", "Esp&aacute;rragos blancos / cepa de apio"), ("Tuna Asada", "Coliflor / semillas de hinojo / r&aacute;bano"),
             ("Tu&eacute;tano Ahumado", "Chimichurri de mostaza / pan tostado"), ("Short Rib &amp; Foie Gras Dumpling", "French onion soup / trufa")]
    body = (top_nav("O.Livia &#183; Menu") + '<div style="height: 114px;"></div>'
            + pills(["Starters", "From the Garden", "Soups", "Meats", "Fish"], 0)
            + '<div style="padding: 18px 20px 4px; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted);">'
            f'{ic("check", 14, 2.2)}Menu verified &#183; Sep 12, 2026</div>'
            + f'<div style="font-family: {SERIF}; font-size: 30px; padding: 8px 20px 6px;">Starters</div>'
            + "".join(f'<div style="padding: 11px 0; margin: 0 20px; border-bottom: 1px solid var(--line);">'
                      f'<div style="font-size: 16.5px; font-weight: 550;">{n}</div>'
                      f'<div style="font-size: 13.5px; color: var(--muted); margin-top: 2px;">{d}</div></div>' for n, d in items))
    return body


def dish_detail():
    hero = ('<div style="position: relative; height: 380px;">' + img("steak") +
            '<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 100px; background: linear-gradient(to bottom, rgba(0,0,0,0), var(--bg));"></div>'
            '<div style="position: absolute; top: 58px; left: 16px; right: 16px; display: flex; justify-content: space-between;">'
            + btn("back", 44, "photo", "Back") + '<div style="display: flex; gap: 8px;">' + btn("heart", 44, "photo", "Like")
            + btn("bookmark", 44, "photo", "Save") + '</div></div></div>')
    body = (hero + '<div style="padding: 0 20px; margin-top: -18px; position: relative;">'
            f'<div style="display: flex; align-items: center; gap: 8px; font-size: 14px;">{avatar("D", 28, 0)}<span style="font-weight: 600;">Diego Read</span>'
            '<span style="color: var(--muted);">&#183; 1w</span></div>'
            f'<div style="font-family: {SERIF}; font-size: 40px; line-height: 1; margin-top: 10px;">Short rib, 14 hours</div>'
            f'<div style="font-family: {SERIF}; font-size: 21px; color: var(--fg2); margin-top: 8px;">&ldquo;Falls apart under the fork.&rdquo;</div></div>'
            + card('<div style="display: flex; align-items: center; gap: 12px;">' + thumb("steak", "", 52, 16)
                   + ttext("El Mes&oacute;n de la Cava", "Steakhouse &#183; Serrall&eacute;s &#183; $$$$", None, 19)
                   + score_stack("9.6", 22) + '</div>', "12px", "18px 16px 0")
            + '<div style="display: flex; gap: 8px; padding: 12px 16px 0;">' + cta("Call", "chip", "phone", 46, size=14)
            + cta("Website", "chip", "globe", 46, size=14) + cta("Directions", "chip", "nav", 46, size=14) + '</div>'
            + f'<div style="padding: 22px 20px 0; font-size: 13px; font-weight: 600; color: var(--muted); display: flex; align-items: center; gap: 6px;">'
            f'{ic("flag", 14, 1.9)}Report this dish</div>')
    return body


# ================================================================ RANK FLOW

def rank_find():
    def r(photo, name, meta, right):
        return (f'<div style="display: flex; align-items: center; gap: 12px; padding: 9px 20px;">{thumb(photo, name, 52, 16)}'
                f'{ttext(name, meta, None, 19)}{right}</div>')
    inner = ('<div style="padding: 0 20px;"><div style="font-family: ' + SERIF + '; font-size: 32px; line-height: 1;">Find the spot</div></div>'
             f'<div style="padding: 14px 16px 0;">{search_bar("Search a spot you&rsquo;ve been to&hellip;")}</div>'
             + pills(["Nearby", "Open now", "Want to try"], 0, pad="12px 20px 0", h=32)
             + section_label("Want to try")
             + r(None, "Forno Bravo &ndash; Naco", "Italian &#183; Naco", score_stack("9.6", 20))
             + r(None, "Trattoria FIGATA", "Pizza &#183; Bella Vista", '<span style="font-size: 12px; font-weight: 650; color: var(--muted);">Not ranked</span>')
             + section_label("All spots")
             + r(None, "Acasa &ndash; Santo Domingo", "Piantini &#183; $$", score_stack("7.9", 20))
             + r("mofongo", "Adrian Tropical", "Dominican &#183; Bella Vista", '<span style="font-size: 12px; font-weight: 650; color: var(--muted);">Not ranked</span>'))
    return feed_scrolled() + sheet(inner, 66, None)


def rank_step(title, inner, back="Back", counter=None):
    c = f'<div style="text-align: center; font-size: 13px; font-weight: 600; color: var(--muted);">{counter}</div>' if counter else ""
    head = ('<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 16px 6px;">'
            + btn("back", 38, "chip", back) + c + btn("close", 38, "chip", "Close") + '</div>')
    return feed_scrolled() + sheet(head + inner, 66, None)


def rank_how():
    opt = lambda t, sub, sel=False: (
        f'<div style="margin: 0 16px 10px; height: 92px; border-radius: 26px; background: {"var(--solid)" if sel else "var(--card)"}; '
        f'color: {"var(--on-solid)" if sel else "var(--fg)"}; box-shadow: var(--lift); display: flex; flex-direction: column; '
        f'align-items: center; justify-content: center;"><span style="font-family: {SERIF}; font-size: 28px; line-height: 1;">{t}</span>'
        f'<span style="font-size: 12.5px; opacity: 0.65; margin-top: 5px;">{sub}</span></div>')
    inner = ('<div style="padding: 18px 20px 20px; text-align: center;">'
             '<div style="width: 64px; height: 64px; border-radius: 20px; overflow: hidden; margin: 0 auto;">' + img("mofongo") + '</div>'
             '<div style="font-size: 13px; font-weight: 600; color: var(--muted); margin-top: 12px;">Adrian Tropical</div>'
             f'<div style="font-family: {SERIF}; font-size: 36px; line-height: 1; margin-top: 4px;">How was it?</div></div>'
             + opt("Loved it", "Scores 6.7 &ndash; 10", True) + opt("It was fine", "Scores 3.4 &ndash; 6.6") + opt("Didn&rsquo;t love it", "Scores 0 &ndash; 3.3"))
    return rank_step("How was it?", inner)


def compare_card(photo, name, meta, foot, score=None):
    top = (f'<div style="height: 132px; overflow: hidden; position: relative;">{img(photo)}</div>' if photo else
           f'<div style="height: 132px; background: var(--card2); display: flex; align-items: center; justify-content: center; '
           f'font-family: {SERIF}; font-size: 30px; box-shadow: inset 0 -1px 0 var(--line);">{name}</div>')
    s = f'<span style="position: absolute; right: 14px; bottom: 14px;">{score_pill(score, "chip", 13)}</span>' if score else ""
    return (f'<div style="position: relative; margin: 0 16px; border-radius: 28px; background: var(--card); box-shadow: var(--lift); overflow: hidden;">{top}'
            f'<div style="padding: 12px 16px 14px;"><div style="font-family: {SERIF}; font-size: 25px; line-height: 1;">{name}</div>'
            f'<div style="font-size: 13px; color: var(--muted); margin-top: 4px;">{meta}</div>'
            f'<div style="font-size: 12.5px; color: var(--fg2); margin-top: 3px;">{foot}</div></div>{s}</div>')


def rank_compare():
    inner = ('<div style="text-align: center; padding: 10px 20px 14px;">'
             f'<div style="font-family: {SERIF}; font-size: 34px; line-height: 1;">Which was better?</div>'
             '<div style="font-size: 13px; color: var(--muted); margin-top: 6px;">Your answer places Adrian Tropical, not the spot&rsquo;s score.</div></div>'
             + compare_card("mofongo", "Adrian Tropical", "Dominican &#183; Bella Vista &#183; $$", "Just went")
             + '<div style="display: flex; justify-content: center; padding: 10px 0;">'
             + cta("About the same", "chip", h=40, size=14, grow=False) + '</div>'
             + compare_card(None, "LILA &ndash; Modern Cuisine", "Contemporary &#183; Piantini &#183; $$", "#27 on your list", "9.2")
             + '<div style="text-align: center; font-size: 13px; font-weight: 600; color: var(--muted); padding: 14px 0;">Haven&rsquo;t been to one? Swap it</div>')
    return rank_step("", inner, counter="1 of 6")


def neighbors(rows):
    return "".join(
        f'<div style="display: flex; align-items: center; gap: 12px; height: 50px; margin: 0 16px 6px; padding: 0 12px 0 16px; border-radius: 18px; '
        f'{"background: var(--card); box-shadow: 0 0 0 1.5px var(--fg);" if me else ""}">'
        f'<span style="font-family: {SERIF}; font-size: 20px; width: 26px; color: var(--muted);">{n}</span>'
        f'<span style="flex: 1; font-family: {SERIF}; font-size: 20px;">{name}</span>{score_pill(s, "chip", 12)}</div>'
        for n, name, s, me in rows)


def rank_result():
    inner = ('<div style="display: flex; justify-content: space-between; padding: 0 16px;">' + btn("back", 38, "chip", "Back")
             + '<span style="font-size: 15px; font-weight: 650; align-self: center;">Done</span></div>'
             '<div style="text-align: center; padding: 4px 20px 14px;">'
             '<div style="font-size: 13px; font-weight: 600; color: var(--muted);">Your score</div>'
             f'<div style="font-family: {SERIF}; font-size: 84px; line-height: 0.95; margin-top: 2px;">9.3</div>'
             '<div style="font-size: 14px; font-weight: 700; margin-top: 2px;">Must go</div>'
             f'<div style="font-family: {SERIF}; font-size: 28px; line-height: 1; margin-top: 12px;">Adrian Tropical</div>'
             '<div style="font-size: 13px; color: var(--muted); margin-top: 4px;">Dominican &#183; Bella Vista &#183; $$</div>'
             '<div style="display: flex; justify-content: center; margin-top: 12px;">'
             '<span style="height: 32px; padding: 0 14px; border-radius: 16px; background: var(--accent); color: var(--on-accent); font-size: 13px; '
             'font-weight: 650; display: flex; align-items: center;">#20 of 160 on your list</span></div></div>'
             + neighbors([("19", "Mamey", "9.3", False), ("20", "Adrian Tropical", "9.3", True), ("21", "&Aacute;ndale", "9.3", False)])
             + section_label("What did you order?") + f'<div style="padding: 0 16px;">{field("Search or add a dish&hellip;", icon="search")}</div>'
             + section_label("Your friends &#183; avg. 7.2")
             + "".join(f'<div style="display: flex; align-items: center; gap: 10px; padding: 6px 20px;">{avatar(l, 30, t)}'
                       f'<span style="flex: 1; font-size: 15px;">{n}</span><span style="font-size: 12.5px; color: var(--muted);">#{p}</span>'
                       f'{score_pill(s, "chip", 12, False)}</div>' for l, t, n, p, s in [("D", 0, "Diego Read", 7, "7.2"), ("L", 1, "Luc&iacute;a Fern&aacute;ndez", 6, "7.2")]))
    foot = ('<div style="position: absolute; left: 16px; right: 16px; bottom: 30px; display: flex; gap: 10px; z-index: 60;">'
            + cta("Add a note", "chip") + cta("Done", "solid") + '</div>')
    return feed_scrolled() + sheet(inner, 66, None) + foot


def rank_dish():
    inner = ('<div style="display: flex; justify-content: space-between; padding: 0 16px;">' + btn("back", 38, "chip", "Back")
             + '<span style="font-size: 15px; font-weight: 650; align-self: center;">Done</span></div>'
             + neighbors([("20", "Adrian Tropical", "9.3", True), ("21", "&Aacute;ndale", "9.3", False)])
             + section_label("What did you order?") + f'<div style="padding: 0 16px;">{field("Search or add a dish&hellip;", icon="search")}</div>'
             + '<div style="display: flex; gap: 8px; padding: 12px 16px 0;">' + pill("Pizza &#183; 2nd", True, h=32) + '</div>'
             + card(f'<div style="display: flex; align-items: center; justify-content: space-between;"><span style="font-family: {SERIF}; font-size: 22px;">Pizza</span>'
                    f'<span style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted);">{ic("check", 14, 2.2)}Saved{ic("close", 16, 2)}</span></div>'
                    + '<div style="display: flex; gap: 6px; margin-top: 12px;">' + pill("Loved it", True, h=32) + pill("It was fine", h=32)
                    + pill("Didn&rsquo;t love it", h=32) + '</div>'
                    '<div style="margin-top: 12px; height: 56px; border-radius: 18px; border: 1.5px dashed var(--line); display: flex; align-items: center; '
                    f'justify-content: center; gap: 8px; font-size: 14.5px; color: var(--fg2);">{ic("camera", 18, 1.9)}Add a photo</div>', "14px", "12px 16px 0"))
    return feed_scrolled() + sheet(inner, 66, None)


def rank_note():
    occ = ["Date night", "Special occasion", "Group dinner", "Outdoors", "Solo", "Fine dining", "Casual", "Late night"]
    inner = ('<div style="display: flex; justify-content: space-between; padding: 0 16px;">' + btn("back", 38, "chip", "Back")
             + '<span style="font-size: 15px; font-weight: 650; align-self: center;">Done</span></div>'
             '<div style="display: flex; align-items: center; gap: 12px; padding: 14px 20px 16px; border-bottom: 1px solid var(--line);">'
             + thumb("mofongo", "", 56, 16) + ttext("Adrian Tropical", "Dominican &#183; Bella Vista", None, 22) + score_pill("9.3", "solid", 14) + '</div>'
             + section_label("Your note") + f'<div style="padding: 0 16px;">{field("candlelit, natural wine, get the branzino&hellip;", h=110, multiline=True)}</div>'
             + section_label("Occasion")
             + '<div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px;">'
             + "".join(pill(o, o in ("Group dinner", "Late night"), h=34) for o in occ) + '</div>')
    foot = f'<div style="position: absolute; left: 16px; right: 16px; bottom: 30px; display: flex; z-index: 60;">{cta("Save note", "solid")}</div>'
    return feed_scrolled() + sheet(inner, 66, None) + foot


# ================================================================ YOUR LIST (pick 11 C, podium)

MINE = [(None, "Cyril Restaurante", "Piantini &#183; $$", "9.6"), ("steak", "Chef Pepper", "Grill &#183; Evaristo Morales", "9.6"),
        (None, "Forno Bravo &ndash; Naco", "Italian &#183; Naco &#183; $$", "9.6"),
        (None, "Asadero Los Argentinos", "Bella Vista &#183; $$", "9.6"), (None, "Detroit Pizza", "Pizza &#183; Naco &#183; $$", "9.5"),
        (None, "SANTINO", "Italian &#183; Piantini", "9.5"), ("branzino", "O.Livia", "Mediterranean &#183; Piantini", "9.4")]


def list_head(active=0):
    stats = "".join(f'<div><div style="font-family: {SERIF}; font-size: 26px; line-height: 1;">{v}</div>'
                    f'<div style="font-size: 12px; color: var(--muted); margin-top: 3px;">{l}</div></div>'
                    for v, l in [("160", "places"), ("3", "saved"), ("2", "week streak")])
    return (TOP + large_title("Your list", top=4, right=btn("trophy", 42, "chip", "Leaderboard") + btn("share", 42, "chip", "Share"))
            + f'<div style="display: flex; gap: 30px; padding: 12px 20px 0;">{stats}</div>'
            + pills(["Mine", "Saved", "Neighborhoods"], active, pad="16px 20px 0"))


def podium_big(n, photo, name, meta, score):
    face = img(photo) + scrim("to top, rgba(20,4,4,0.85) 0%, rgba(20,4,4,0) 60%") if photo else ""
    col = "#f5efe4" if photo else "var(--fg)"
    bg = "" if photo else "background: var(--card2); box-shadow: inset 0 0 0 1px var(--line);"
    return (f'<div style="position: relative; height: 196px; margin: 0 16px; border-radius: 30px; overflow: hidden; {bg}">{face}'
            f'<span style="position: absolute; left: 16px; bottom: -10px; font-family: {SERIF}; font-size: 150px; line-height: 1; color: {col}; opacity: {0.92 if photo else 0.14};">{n}</span>'
            f'<span style="position: absolute; top: 14px; right: 14px;">{score_pill(score, "photo" if photo else "solid", 14)}</span>'
            f'<div style="position: absolute; left: 96px; right: 16px; bottom: 18px; color: {col};">'
            f'<div style="font-family: {SERIF}; font-size: 30px; line-height: 1;">{name}</div>'
            f'<div style="font-size: 12.5px; opacity: 0.75; margin-top: 5px;">{meta}</div></div></div>')


def podium_half(n, photo, name, score):
    face = img(photo) + scrim("to top, rgba(20,4,4,0.85) 0%, rgba(20,4,4,0) 60%") if photo else ""
    col = "#f5efe4" if photo else "var(--fg)"
    bg = "" if photo else "background: var(--card2); box-shadow: inset 0 0 0 1px var(--line);"
    return (f'<div style="position: relative; height: 146px; border-radius: 26px; overflow: hidden; {bg}">{face}'
            f'<span style="position: absolute; left: 12px; bottom: -8px; font-family: {SERIF}; font-size: 90px; line-height: 1; color: {col}; opacity: {0.92 if photo else 0.14};">{n}</span>'
            f'<span style="position: absolute; top: 10px; right: 10px;">{score_pill(score, "photo" if photo else "solid", 12, False)}</span>'
            f'<div style="position: absolute; left: 58px; right: 10px; bottom: 14px; font-family: {SERIF}; font-size: 19px; line-height: 1.02; color: {col};">{name}</div></div>')


def rank_list_row(n, photo, name, meta, score):
    return (f'<div style="display: flex; align-items: center; gap: 12px; padding: 9px 0; margin: 0 20px; border-bottom: 1px solid var(--line);">'
            f'<span style="font-family: {SERIF}; font-size: 22px; width: 24px; color: var(--muted); flex-shrink: 0;">{n}</span>'
            + thumb(photo, name, 50, 15) + ttext(name, meta, None, 19) + score_stack(score, 22)
            + f'<span style="color: var(--faint); display: flex;">{ic("more", 18)}</span></div>')


def list_mine(with_toast=False):
    chips = ('<div style="display: flex; gap: 8px; padding: 12px 20px 14px; overflow: hidden;">'
             + pill("My order", icon="sort", chevron=True, h=34) + pill("Neighborhood", chevron=True, h=34) + pill("Occasion", chevron=True, h=34)
             + pill("Price", chevron=True, h=34) + '</div>')
    p = MINE
    body = (list_head() + chips + podium_big(1, *p[0])
            + '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 10px 16px 4px;">'
            + podium_half(2, p[1][0], p[1][1], p[1][3]) + podium_half(3, p[2][0], p[2][1], p[2][3]) + '</div>'
            + "".join(rank_list_row(i + 4, *r) for i, r in enumerate(p[3:6])))
    t = toast("Adrian Tropical landed at #20 on your list.", 108) if with_toast else ""
    return body + t + tabbar("rankings")


def list_sort():
    return list_mine() + menu(["My order", "Score", "Recent", "Name"], 0, top=262, left=20, width=220, title="Sort by")


def list_filter():
    return list_mine() + menu(["Any", "Bella Vista", "Evaristo Morales", "Gazcue", "Naco", "Piantini", "Serrall&eacute;s", "Zona Colonial"],
                              0, top=262, left=128, width=230, title="Neighborhood")


def saved_row(photo, name, meta):
    return ('<div style="display: flex; align-items: center; gap: 12px; margin: 0 16px 8px; padding: 10px 12px; border-radius: 22px; '
            'background: var(--card); box-shadow: var(--lift);">' + thumb(photo, name, 54, 16) + ttext(name, meta, None, 19)
            + cta("Rank", "solid", h=34, size=13, grow=False) + btn("close", 34, "ghost", "Remove") + '</div>')


def list_saved():
    body = (list_head(1) + pills(["Restaurants", "Dishes", "Events"], 0, pad="12px 20px 14px", h=32)
            + saved_row(None, "Forno Bravo &ndash; Naco", "Italian &#183; Naco &#183; $$")
            + saved_row(None, "Nonna Julia", "Pizza &#183; Piantini &#183; $$")
            + saved_row(None, "Trattoria FIGATA", "Pizza &#183; Bella Vista &#183; $$")
            + saved_row("ceviche", "Segundo Muelle", "Peruvian &#183; Naco &#183; $$$"))
    return body + tabbar("rankings")


def list_saved_dishes():
    body = (list_head(1) + pills(["Restaurants", "Dishes", "Events"], 1, pad="12px 20px 14px", h=32)
            + '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 0 16px;">'
            + "".join(f'<div><div style="height: 150px; border-radius: 22px; overflow: hidden;">{img(p)}</div>'
                      f'<div style="font-family: {SERIF}; font-size: 18px; margin-top: 7px; {ELL}">{n}</div>'
                      f'<div style="font-size: 12px; color: var(--muted);">{r}</div></div>'
                      for p, n, r in [("steak", "Short rib, 14 hours", "El Mes&oacute;n de la Cava"),
                                      ("pizza", "Margherita, wood-fired", "Vesuvio Sarasota")]) + '</div>')
    return body + tabbar("rankings")


def list_saved_events():
    return (list_head(1) + pills(["Restaurants", "Dishes", "Events"], 2, pad="12px 20px 0", h=32)
            + empty("No saved events yet.", "Tap the bookmark on an event to keep it here.", "Browse events", 60) + tabbar("rankings"))


def list_hoods():
    hoods = [("Piantini", 51, "8.3"), ("Naco", 29, "8.6"), ("Bella Vista", 29, "8.2"), ("Zona Colonial", 21, "8.4"),
             ("Evaristo Morales", 14, "8.5"), ("Gazcue", 10, "8.7"), ("Serrall&eacute;s", 6, "8.2")]
    body = (list_head(2) + '<div style="height: 10px;"></div>'
            + "".join(f'<div style="margin: 0 16px 8px; padding: 14px 16px 14px; border-radius: 22px; background: var(--card); box-shadow: var(--lift);">'
                      f'<div style="display: flex; align-items: baseline; justify-content: space-between;"><span style="font-family: {SERIF}; font-size: 22px;">{h}</span>'
                      f'<span style="font-size: 13px; color: var(--muted);">{n} spots &#183; avg. <span style="font-family: {SERIF}; font-size: 16px; color: var(--fg);">{a}</span></span></div>'
                      f'<div style="height: 6px; border-radius: 3px; background: var(--sunk); margin-top: 10px; overflow: hidden;">'
                      f'<div style="width: {int(n / 51 * 100)}%; height: 100%; border-radius: 3px; background: var(--accent);"></div></div></div>'
                      for h, n, a in hoods))
    return body + tabbar("rankings")


def leaderboard():
    people = [("E", 0, "Enrique Hern&aacute;ndez", "@enriquehdz &#183; Piantini", 160, True), ("R", 1, "Ra&uacute;l Rosario", "@raul &#183; Evaristo Morales", 22, False),
              ("S", 2, "Sebasti&aacute;n Polanco", "@sebastian &#183; Zona Colonial", 22, False), ("O", 3, "Omar F&eacute;liz", "@omar &#183; Evaristo Morales", 21, False),
              ("J", 4, "Julio Guzm&aacute;n", "@julio &#183; Gazcue", 20, False), ("P", 5, "Patricia Mena", "@patricia &#183; Zona Colonial", 19, False),
              ("A", 1, "Amelia Valdez", "@amelia &#183; Evaristo Morales", 19, False)]
    body = (top_nav() + large_title("Leaderboard", "Santo Domingo", top=112)
            + '<div style="display: flex; gap: 8px; padding: 16px 20px 0;">' + pill("This month", h=34) + pill("All time", True, h=34)
            + '<span style="width: 1px; background: var(--line); margin: 4px 4px;"></span>' + pill("City", True, h=34) + pill("Friends", h=34) + '</div>'
            + f'<div style="padding: 16px 20px 8px; font-family: {SERIF}; font-size: 22px;">You&rsquo;re #1 in the city.</div>'
            + "".join(f'<div style="display: flex; align-items: center; gap: 12px; padding: 9px 12px; margin: 0 16px 6px; border-radius: 20px; '
                      f'{"background: var(--card); box-shadow: var(--lift);" if me else ""}">'
                      f'<span style="font-family: {SERIF}; font-size: 22px; width: 22px; color: var(--muted);">{i + 1}</span>{avatar(l, 40, t)}'
                      f'{ttext(n, h, None, 18)}<div style="text-align: right;"><div style="font-family: {SERIF}; font-size: 22px; line-height: 1;">{c}</div>'
                      f'<div style="font-size: 11px; color: var(--muted);">spots</div></div></div>'
                      for i, (l, t, n, h, c, me) in enumerate(people)))
    return body
