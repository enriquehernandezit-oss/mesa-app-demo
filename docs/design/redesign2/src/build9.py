#!/usr/bin/env python3
"""Mesa Redesign 2 — round 8: Cream by day, black + a bit of burgundy by night; the full-photo place page with its
details on scroll; one hero for every event surface; no rainbow; the rating slider. Every screen, both themes.

Reuses build8's board machinery; screens_v2 rebinds the screens that changed."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build8 as b8  # noqa: E402
import screens_v2 as V  # noqa: E402  (import rebinds podium, mini podium and place_top in screens_a/b)
from build8 import A, B, C, INK, MUTED, SAND, board_head, icon_cream, icon_home, mini, page, sys_block, swatches  # noqa: E402
from mesa_ui import SERIF, img, map_svg, name_card, pills, rank_bar, score_pill, tabbar  # noqa: E402

OUT = os.path.join(HERE, "redesign2", "project")

BOARDS = [
    b8.BOARDS[0],
    ("B02-Feed.dc.html", "Feed", "Greeting, pills, your six, tonight as one hero (or tonight&rsquo;s pick), friends&rsquo; cards, shelves, the end, and what hangs off it.", [
        ("For you", V.feed_for_you), ("Tonight", V.feed_tonight), ("Tonight &middot; no events", V.feed_tonight_pick),
        ("Friends&rsquo; cards", A.feed_scrolled), ("Shelves", A.feed_shelf), ("End of the feed", A.feed_end), ("Popular", A.feed_popular),
        ("Lists", A.feed_lists), ("Activity", A.activity), ("Activity &middot; empty", A.activity_empty), ("Comments", A.comments)]),
    ("B03-Explore.dc.html", "Explore", "Places with trending, sort and filters, search with Google results, events, and the map.", [
        ("Places", A.explore_places), ("Sort menu", A.explore_sort), ("Filters", A.explore_filters), ("Search", A.explore_search),
        ("Events", V.explore_events), ("Map", A.map_screen)]),
    ("B04-Restaurant.dc.html", "Restaurant", "The photo is the page; scroll and the details come up. Without a photo, the map takes its place.", [
        ("Place", V.place_top), ("Place &middot; details", V.place_more), ("Place &middot; more details", V.place_info),
        ("Place &middot; no photo", V.place_nophoto), ("Place map", b8.place_map), ("Menu", A.menu_screen), ("All dishes", B.all_dishes),
        ("Dish", A.dish_detail), ("Post a dish", B.post_dish), ("Add to a list", B.save_to_list)]),
    ("B05-Rank.dc.html", "Rank a spot", "The + button&rsquo;s flow. &ldquo;How was it?&rdquo; is now one slider; the photo sets the mood.", [
        ("Find the spot", A.rank_find), ("How was it? &middot; loved it", lambda: V.rank_how("loved")),
        ("How was it? &middot; fine", lambda: V.rank_how("fine")), ("How was it? &middot; didn&rsquo;t love it", lambda: V.rank_how("didnt")),
        ("Which was better?", A.rank_compare), ("Your score", A.rank_result), ("What you ordered", V.rank_dish), ("Add a note", A.rank_note),
        ("Back on your list", lambda: A.list_mine(True))]),
    b8.BOARDS[5], b8.BOARDS[6], b8.BOARDS[7], b8.BOARDS[8],
    ("B10-Plans-events.dc.html", "Plans and events", "Tables with friends, the four steps to set one, and an event &mdash; the same photo-first page as a place.", [
        ("Plans", B.plans), ("A table &middot; voting", B.plan_detail), ("New &middot; where", B.plan_where), ("New &middot; when", B.plan_when),
        ("New &middot; with whom", B.plan_who), ("New &middot; review", B.plan_review), ("Invite more", B.plan_invite), ("Event", V.event_top),
        ("Event &middot; details", B.event_more)]),
    b8.BOARDS[10],
]


def system_board():
    w, h = 2000, 1990
    icons = ('<div style="display: flex; gap: 48px;">'
             + '<div style="display: flex; flex-direction: column; gap: 16px; align-items: flex-start;">' + C.mark(200) + icon_home(C.mark(60))
             + '<div style="font-size: 15px; font-weight: 650;">B &middot; cream M on the original oxblood</div>'
             f'<div style="font-size: 14px; color: {MUTED}; max-width: 330px; margin-top: -8px;">The app&rsquo;s own burgundy (#210104), darker as you asked. The screens use this one.</div></div>'
             + '<div style="display: flex; flex-direction: column; gap: 16px; align-items: flex-start;">' + icon_cream(200) + icon_home(icon_cream(60))
             + '<div style="font-size: 15px; font-weight: 650;">B &middot; the inverse</div>'
             f'<div style="font-size: 14px; color: {MUTED}; max-width: 330px; margin-top: -8px;">Oxblood M on cream. Say if you meant this one.</div></div></div>')
    lockups = ('<div style="display: flex; flex-direction: column; gap: 12px;">'
               + "".join(mini(t, f'<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;">{C.wordmark(40)}</div>', 420, 130)
                         for t in ("Day", "Night")) + '</div>')
    pal = (f'<div style="display: flex; flex-direction: column; gap: 22px;"><div><div style="font-size: 15px; font-weight: 650; margin-bottom: 10px;">Afternoon</div>'
           + swatches([("Cream", "#f3ede4"), ("Card", "#ffffff"), ("Ink", "#16110f"), ("Burgundy", "#7a1a29"), ("Oxblood &middot; icon", "#210104")])
           + '</div><div><div style="font-size: 15px; font-weight: 650; margin-bottom: 10px;">Candlelit</div>'
           + swatches([("Black", "#0b0809"), ("Card", "#171213"), ("Raised", "#1f191a"), ("Cream", "#f4ede2"), ("Burgundy", "#7a1a29")])
           + f'<div style="font-size: 14px; color: {MUTED}; margin-top: 12px; max-width: 640px;">One accent in both themes: burgundy on the + button, Rank it, '
           'the slider, tonight&rsquo;s time and the score words. No other hues &mdash; event categories are told apart by icon, not color.</div></div></div>')
    typ = ('<div style="display: flex; flex-direction: column; gap: 12px;">'
           + "".join(f'<div style="display: flex; align-items: baseline; gap: 18px;"><span style="width: 150px; font-size: 13px; color: {MUTED};">{l}</span>'
                     f'<span style="{s}">{t}</span></div>' for l, s, t in [
                         ("Serif &middot; 46 place", f"font-family: {SERIF}; font-size: 46px; line-height: 1;", "Peperoni"),
                         ("Serif &middot; 33 greeting", f"font-family: {SERIF}; font-size: 33px; line-height: 1;", "Good evening, Enrique"),
                         ("Serif &middot; 21 names", f"font-family: {SERIF}; font-size: 21px;", "Segundo Muelle &middot; Lul&uacute; Tasting Bar"),
                         ("Serif &middot; notes", f"font-family: {SERIF}; font-size: 21px;", "&ldquo;El pargo entero. No hay discusi&oacute;n.&rdquo;"),
                         ("SF Pro &middot; 21 sections", "font-size: 21px; font-weight: 650;", "Tonight"),
                         ("SF Pro &middot; 15 body", "font-size: 15px;", "Where are we going tonight?"),
                         ("SF Pro &middot; 12.5 meta", f"font-size: 12.5px; color: {MUTED};", "Peruvian &middot; Naco &middot; $$$")])
           + f'<div style="font-size: 14px; color: {MUTED}; margin-top: 4px;">Upright everywhere &mdash; no italics, notes included.</div></div>')
    row5 = lambda: ('<div style="position: absolute; inset: 0; display: flex; align-items: center; gap: 8px; padding: 0 18px;">'
                    + "".join(score_pill(s, "chip", 15) for s in ["9.6", "8.4", "7.2", "5.9", "4.1"]) + '</div>')
    words = (mini("Day", row5(), 560, 80) + '<div style="height: 10px;"></div>' + mini("Night", row5(), 560, 80)
             + f'<div style="font-size: 14px; color: {MUTED}; margin-top: 12px; max-width: 560px;">9+ Must go &middot; 8+ Great &middot; 7+ Good &middot; 5+ Fine &middot; '
             'below, Skip. On photos it sits on glass; in dense rows the word, in burgundy, tucks under the number.</div>')
    slider = ('<div style="display: flex; flex-direction: column; gap: 10px;">'
              + "".join(mini(t, f'<div style="padding: 20px 20px 0;">{V.feel_slider(k)}</div>', 393, 120) for t, k in (("Day", "loved"), ("Night", "fine")))
              + f'<div style="font-size: 14px; color: {MUTED}; max-width: 393px;">&ldquo;How was it?&rdquo; as one slider. Same three answers the ranking needs; '
              'the handle&rsquo;s line smiles, flattens or frowns, and the place&rsquo;s photo goes vivid, muted or black and white.</div></div>')
    nophoto = ('<div style="display: flex; gap: 14px;">'
               + mini("Day", A.friend_card(A.FRIENDS[2]).replace("margin: 0 16px 10px", "margin: 0"), 380, 160)
               .replace('overflow: hidden; position: relative; flex-shrink: 0;', 'overflow: hidden; position: relative; flex-shrink: 0; padding: 12px; box-sizing: border-box;')
               + mini("Night", '<div style="padding: 16px; display: flex; gap: 12px; align-items: center;">' + name_card("Cyril Restaurante", 72, 20)
                      + '<div style="font-size: 14px; line-height: 1.4;">No photo, no note &mdash;<br>the name card.</div></div>', 300, 160)
               + mini("Day", f'<div style="position: absolute; inset: 0;">{map_svg(True)}</div>', 220, 160) + '</div>'
               f'<div style="font-size: 14px; color: {MUTED}; margin-top: 12px; max-width: 900px;">Picture rule: the friend&rsquo;s photo &rarr; the place&rsquo;s photo &rarr; '
               'the friend&rsquo;s words set as the picture &rarr; the name card. A place page with no photo opens on its map.</div>')
    comps = ('<div style="display: flex; flex-direction: column; gap: 14px;">'
             + "".join(mini(t, '<div style="position: absolute; left: 0; right: 0; top: 0; height: 160px;">' + img("pizza") + '</div>' + tabbar("feed", 14), 393, 94)
                       for t in ("Day", "Night"))
             + "".join(mini(t, rank_bar("Rank it", 12), 393, 94) for t in ("Day", "Night"))
             + "".join(mini(t, '<div style="padding: 22px 0 0;">' + pills(["For you", "Friends", "Popular", "Events", "Lists"]) + '</div>', 393, 80)
                       for t in ("Day", "Night")) + '</div>')
    shares = ('<div style="display: flex; gap: 24px;">' + C.share_card("spot") + C.share_card("list") + '</div>'
              f'<div style="font-size: 14px; color: {MUTED}; margin-top: 12px; max-width: 560px;">The story image stays black and burgundy in both themes &mdash; it leaves the app.</div>')
    inner = (f'<div style="width: 100%; height: 100%; box-sizing: border-box; background: {SAND}; color: {INK}; padding: 56px 64px;">'
             + board_head("00 &middot; the system", "Mesa, the parts", "The icon, the wordmark, both palettes, the type, the score, the slider, the no-photo rule, and the shared controls.", False)
             + '<div style="display: flex; gap: 80px;">'
             + sys_block("App icon &middot; pick 10", icons) + sys_block("Wordmark", lockups) + sys_block("Share card", shares) + '</div>'
             + '<div style="display: flex; gap: 80px; margin-top: 70px;">'
             + sys_block("Color", pal) + sys_block("Type", typ) + sys_block("Score &middot; pick 07", words) + '</div>'
             + '<div style="display: flex; gap: 80px; margin-top: 70px;">'
             + sys_block("No photo &middot; pick 06", nophoto) + sys_block("How was it?", slider)
             + sys_block("Tab bar, rank bar, pills", comps) + '</div></div>')
    return "S00-System.dc.html", "The system", w, h, page("Mesa &middot; the system", w, h, inner)


PICKS = [("01", "Colors", "Cream by day, black + burgundy at night"), ("02", "Top of the feed", "Greeting"), ("03", "Pills", "Pills"),
         ("04", "Tonight &amp; events", "One hero"), ("05", "Friends&rsquo; rankings", "Cards"), ("06", "No photo", "Words, name card, map"),
         ("07", "Score", "Number + word"), ("08", "Tab bar", "Active circle"), ("09", "Rank button", "Rank it + save + directions"),
         ("10", "Icon", "M on the original oxblood"), ("11", "Your list", "Podium"), ("12", "Place page", "The photo, details on scroll"),
         ("13", "How was it?", "One slider")]


def main_page(boards):
    w, h = 1480, 1240
    picks = "".join(f'<div style="display: flex; gap: 10px; align-items: baseline; padding: 7px 0; border-bottom: 1px solid rgba(244,237,226,0.09);">'
                    f'<span style="font-size: 12px; font-weight: 700; color: rgba(244,237,226,0.5); width: 22px;">{n}</span>'
                    f'<span style="font-size: 14.5px; color: rgba(244,237,226,0.62); width: 150px;">{t}</span>'
                    f'<span style="font-family: {SERIF}; font-size: 19px;">{v}</span></div>' for n, t, v in PICKS)
    tiles = "".join(f'<a href="{f}" class="tile" style="border-radius: 24px; background: #171213; color: #f4ede2; padding: 18px 20px; text-decoration: none; '
                    f'display: flex; flex-direction: column; gap: 6px; min-height: 124px; box-sizing: border-box;">'
                    f'<span style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; color: rgba(244,237,226,0.5);">{i:02d}</span>'
                    f'<span style="font-family: {SERIF}; font-size: 27px; line-height: 1.02;">{t}</span>'
                    f'<span style="margin-top: auto; font-size: 13px; color: rgba(244,237,226,0.55);">{n}</span></a>'
                    for i, (f, t, n) in enumerate(boards))
    inner = ('<div style="width: 100%; height: 100%; box-sizing: border-box; background: #0b0809; color: #f4ede2; padding: 64px 72px; display: flex; gap: 72px;">'
             '<div style="width: 470px; flex-shrink: 0; display: flex; flex-direction: column;">'
             + C.wordmark(34) +
             f'<div style="font-family: {SERIF}; font-size: 60px; line-height: 1; margin-top: 36px;">Every screen, round two</div>'
             '<p style="margin: 16px 0 22px; font-size: 16px; line-height: 1.5; color: rgba(244,237,226,0.68);">Black and a bit of burgundy at night, the photo-first '
             'place page, one hero for events, no rainbow, and the rating slider &mdash; across every page. Afternoon on top of each board, Candlelit below.</p>'
             f'<div>{picks}</div></div>'
             '<div style="flex: 1; display: flex; flex-direction: column;">'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(244,237,226,0.5); margin-bottom: 14px;">THE BOARDS</div>'
             f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">{tiles}</div>'
             '<div style="margin-top: auto; font-size: 13.5px; line-height: 1.5; color: rgba(244,237,226,0.5);">Photos are the ones Mesa already serves. People, '
             'notes and numbers come from your demo data or are examples.</div></div></div>')
    css = (".tile { transition: transform 150ms ease; } .tile:hover { transform: translateY(-3px); }\n"
           ".tile:focus-visible { outline: 2px solid #f4ede2; outline-offset: 3px; }\n"
           "@media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile:hover { transform: none; } }")
    return "Main.dc.html", "Start here", w, h, page("Mesa redesign, round two", w, h, inner, css)


def main():
    os.makedirs(OUT, exist_ok=True)
    built = [system_board()] + [b8.screen_board(i + 1, *b) for i, b in enumerate(BOARDS)]
    total = sum(len(b[3]) for b in BOARDS)
    index = [("S00-System.dc.html", "The system", "Icon, color, type, controls")] + [(b[0], b[1], f"{len(b[3])} screens") for b in BOARDS]
    mp = main_page(index)
    boards = {mp[0]: {"x": 0, "y": 0, "w": mp[2], "h": mp[3], "title": "Start here", "is_interactive": True}}
    order = [mp[0]]
    notes = {"n1": {"kind": "title1", "maxW": mp[2], "text": "Mesa — every screen, round two", "w": 240, "x": 0, "y": -280}}
    y = mp[3] + 440
    for i, (fname, title, w, h, _) in enumerate(built):
        clean = title.replace("&rsquo;", "’")
        notes[f"t{i}"] = {"kind": "title1", "maxW": w, "text": ("00 · " if i == 0 else f"{i:02d} · ") + clean, "w": 240, "x": 0, "y": y - 280}
        boards[fname] = {"x": 0, "y": y, "w": w, "h": h, "title": clean}
        order.append(fname)
        y += h + 440
    remap_path = os.path.join(HERE, "photos2.json")
    remap = json.load(open(remap_path)) if os.path.exists(remap_path) else {}
    for fname, _, _, _, html in [mp] + built:
        for old_url, new_url in remap.items():
            html = html.replace(old_url, new_url)
        with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
            f.write(html)
    canvas = {"v": 3, "attachments": {}, "boards": boards, "createdOnFiles": {"at": "2026-09-29T02:00:00Z", "v": 1}, "designSystems": [],
              "launch": {"file": "Main.dc.html", "view": "focused"}, "notes": notes, "order": order, "pages": [], "title": "Mesa Redesign 2"}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, indent=1, ensure_ascii=False)
    for fname, _, w, h, html in [mp] + built:
        print(f"{fname:28s} {w}x{h} {len(html) / 1024:7.0f} KB")
    print("screens:", total, "| photos remapped:", bool(remap))


if __name__ == "__main__":
    main()
