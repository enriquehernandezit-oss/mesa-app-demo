#!/usr/bin/env python3
"""Mesa Redesign — every screen of the app in the founder's picks, Afternoon (Day) over Candlelit (Night).

Writes redesign/project/*.dc.html + canvas.json. Photos resolve through photos.json (this artifact's copies).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mesa_ui as ui  # noqa: E402
from mesa_ui import GF, SERIF, UI, THEMES_CSS, btn, cta, ic, img, map_svg, name_card, pills, rank_bar, score_pill, tabbar, thumb, top_nav, word  # noqa: E402
import screens_a as A  # noqa: E402
import screens_b as B  # noqa: E402
import screens_c as C  # noqa: E402

OUT = os.path.join(HERE, "redesign", "project")
INK, SAND, MUTED = "#2a1512", "#e8dfd2", "#6f5d50"


def place_map():
    bar = ('<div style="position: absolute; left: 16px; right: 16px; bottom: 34px; border-radius: 28px; background: var(--card); box-shadow: var(--lift); '
           'padding: 14px 14px 14px 18px; display: flex; align-items: center; gap: 12px; z-index: 30;">'
           '<div style="flex: 1; font-size: 14px; line-height: 1.35; color: var(--fg2);">Av. Lope de Vega 40<br>Piantini, Santo Domingo</div>'
           + cta("Directions", "solid", "nav", 46, grow=False, size=15) + '</div>')
    return f'<div style="position: absolute; inset: 0;">{map_svg(True, True)}</div>' + top_nav("O.Livia", "back", None, "glass") + bar


BOARDS = [
    ("B01-Welcome.dc.html", "Welcome", "Splash, sign-up and sign-in, the three onboarding steps, and the pages email links open.", [
        ("Splash", C.splash), ("Create account", C.sign_up), ("Sign in &middot; error", C.sign_in), ("Onboarding 1 &middot; You", C.onboarding_profile),
        ("Onboarding 2 &middot; Pick spots", C.onboarding_pick), ("Onboarding 2 &middot; Compare", C.onboarding_compare),
        ("Onboarding 3 &middot; Friends", C.onboarding_friends), ("Email confirmed", C.verify_email), ("Reset password", C.reset_password),
        ("Account suspended", C.suspended)]),
    ("B02-Feed.dc.html", "Feed", "Greeting, pills, your six, tonight, friends&rsquo; cards, shelves, the end of the feed, and what hangs off it.", [
        ("For you", A.feed_for_you), ("Friends&rsquo; cards", A.feed_scrolled), ("Shelves", A.feed_shelf), ("End of the feed", A.feed_end),
        ("Popular", A.feed_popular), ("Lists", A.feed_lists), ("Activity", A.activity), ("Activity &middot; empty", A.activity_empty),
        ("Comments", A.comments)]),
    ("B03-Explore.dc.html", "Explore", "Places with trending, sort and filters, search with Google results, events, and the map.", [
        ("Places", A.explore_places), ("Sort menu", A.explore_sort), ("Filters", A.explore_filters), ("Search", A.explore_search),
        ("Events", A.explore_events), ("Map", A.map_screen)]),
    ("B04-Restaurant.dc.html", "Restaurant", "A place with a photo, scrolled, and without one; its map, menu and dishes; saving and posting.", [
        ("Place", A.place_top), ("Place &middot; scrolled", A.place_more), ("Place &middot; no photo", A.place_nophoto), ("Place map", place_map),
        ("Menu", A.menu_screen), ("All dishes", B.all_dishes), ("Dish", A.dish_detail), ("Post a dish", B.post_dish), ("Add to a list", B.save_to_list)]),
    ("B05-Rank.dc.html", "Rank a spot", "The + button&rsquo;s flow, start to finish, and where it lands you.", [
        ("Find the spot", A.rank_find), ("How was it?", A.rank_how), ("Which was better?", A.rank_compare), ("Your score", A.rank_result),
        ("What you ordered", A.rank_dish), ("Add a note", A.rank_note), ("Back on your list", lambda: A.list_mine(True))]),
    ("B06-Your-list.dc.html", "Your list", "The Rankings tab: the podium, sorting and filters, saved places, dishes and events, neighborhoods, leaderboard.", [
        ("Mine", A.list_mine), ("Sort menu", A.list_sort), ("Filter menu", A.list_filter), ("Saved", A.list_saved), ("Saved dishes", A.list_saved_dishes),
        ("Saved events &middot; empty", A.list_saved_events), ("Neighborhoods", A.list_hoods), ("Leaderboard", A.leaderboard)]),
    ("B07-Profile.dc.html", "Profile", "Your profile, editing it, and finding friends.", [
        ("You", B.profile_me), ("You &middot; scrolled", B.profile_more), ("Edit profile", B.edit_profile), ("Edit profile &middot; more", B.edit_profile_more),
        ("Find friends", B.find_friends), ("Import from Instagram", B.instagram)]),
    ("B08-People.dc.html", "People", "Someone else&rsquo;s profile, the safety actions on it, taste match, and followers.", [
        ("Member", B.member_profile), ("More menu", B.member_menu), ("Report", B.member_report), ("Block", B.member_block),
        ("Reported", C.reported_toast), ("Taste match", B.taste_match), ("Followers", B.followers)]),
    ("B09-Lists-dishes.dc.html", "Lists and dishes", "Featured lists, your own lists, and dish rankings.", [
        ("Featured list", B.featured_list), ("Your lists", B.your_lists), ("A list", B.one_list), ("Your dishes", B.your_dishes),
        ("Your best pizza", B.dish_ranking), ("Rank your pizza", B.dish_rank)]),
    ("B10-Plans-events.dc.html", "Plans and events", "Tables with friends, the four steps to set one, and an event.", [
        ("Plans", B.plans), ("A table &middot; voting", B.plan_detail), ("New &middot; where", B.plan_where), ("New &middot; when", B.plan_when),
        ("New &middot; with whom", B.plan_who), ("New &middot; review", B.plan_review), ("Invite more", B.plan_invite), ("Event", B.event_top),
        ("Event &middot; scrolled", B.event_more)]),
    ("B11-Settings.dc.html", "Settings", "Everything behind the gear, moderation, and the photo editor.", [
        ("Settings", C.settings), ("Your account", C.account), ("Privacy", C.privacy), ("Blocked", C.blocked), ("Preferences", C.preferences),
        ("Notifications", C.notifications), ("About", C.about), ("Legal", C.legal), ("Moderation", C.moderation), ("Edit photo", C.photo_edit)]),
]


def phone(theme, inner):
    return (f'<div class="{theme}" style="width: 393px; height: 852px; border-radius: 54px; overflow: hidden; position: relative; flex-shrink: 0; '
            f'background: var(--bg); color: var(--fg); font-family: {UI}; -webkit-font-smoothing: antialiased; '
            'box-shadow: 0 0 0 6px #0d0b0b, 0 0 0 7.5px #34302f, 0 30px 60px rgba(40,20,10,0.22);">'
            '<div style="position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 112px; height: 33px; border-radius: 20px; '
            f'background: #000; z-index: 80;"></div>{inner}</div>')


def page(title, w, h, inner, extra_css=""):
    props = json.dumps({"$preview": {"width": w, "height": h}}, separators=(",", ":"))
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            f'<title>{title}</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'<link rel="stylesheet" href="{GF}">\n<style>\nbody {{ margin: 0; }}\nbutton {{ font: inherit; cursor: default; }}\n'
            f'{THEMES_CSS}{extra_css}\n</style>\n</helmet>\n'
            f'<div style="width: {w}px; height: {h}px; box-sizing: border-box; font-family: {UI}; font-synthesis: none;">\n{inner}\n</div>\n</x-dc>\n'
            f"<script type=\"text/x-dc\" data-dc-script data-props='{props}'>\n"
            "class Component extends DCLogic {\n  renderVals() { return {}; }\n}\n</script>\n</body>\n</html>\n")


GAP, PAD = 44, 64


def board_head(num, title, sub, legend=True):
    leg = ('<div style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: ' + MUTED + '; text-align: right;">'
           '<span>Top row &mdash; <b style="color: ' + INK + ';">Afternoon</b> (day)</span>'
           '<span>Bottom row &mdash; <b style="color: ' + INK + ';">Candlelit</b> (after 6 PM)</span></div>') if legend else ""
    return ('<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; height: 112px; margin-bottom: 36px;">'
            f'<div><div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: {MUTED};">{num}</div>'
            f'<div style="font-family: {SERIF}; font-size: 60px; line-height: 1; margin-top: 8px;">{title}</div>'
            f'<p style="margin: 10px 0 0; font-size: 17px; color: {MUTED}; max-width: 900px;">{sub}</p></div>{leg}</div>')


def screen_board(idx, fname, title, sub, screens):
    n = len(screens)
    w = PAD * 2 + n * 393 + (n - 1) * GAP
    h = 56 + 148 + 34 + 852 + 40 + 852 + 60
    cols = "".join(
        f'<div style="display: flex; flex-direction: column; gap: 40px; width: 393px; flex-shrink: 0;">'
        f'<div style="height: 18px; margin-bottom: -24px; font-size: 16px; font-weight: 650; color: {INK};">{name}</div>'
        + phone("Day", fn()) + phone("Night", fn()) + '</div>' for name, fn in screens)
    inner = (f'<div style="width: 100%; height: 100%; box-sizing: border-box; background: {SAND}; color: {INK}; padding: 56px {PAD}px 48px;">'
             + board_head(f"{idx:02d} &middot; {n} screens", title, sub) +
             f'<div style="display: flex; gap: {GAP}px; align-items: flex-start;">{cols}</div></div>')
    return fname, title, w, h, page(f"Mesa &middot; {title}", w, h, inner)


# ---------------------------------------------------------------- system board

def swatches(items):
    return ('<div style="display: flex; gap: 12px;">' + "".join(
        f'<div style="width: 118px;"><div style="height: 74px; border-radius: 18px; background: {c}; box-shadow: inset 0 0 0 1px rgba(60,30,20,0.14);"></div>'
        f'<div style="font-size: 14px; font-weight: 650; margin-top: 8px;">{n}</div>'
        f'<div style="font-size: 12.5px; color: {MUTED}; font-family: ui-monospace, Menlo, monospace;">{c}</div></div>' for n, c in items) + '</div>')


def sys_block(title, body, w=None):
    ww = f"width: {w}px; " if w else ""
    return (f'<div style="{ww}flex-shrink: 0;"><div style="font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: {MUTED}; '
            f'margin-bottom: 16px;">{title}</div>{body}</div>')


def mini(theme, inner, w=393, h=120, pad=True):
    return (f'<div class="{theme}" style="width: {w}px; height: {h}px; border-radius: 30px; overflow: hidden; position: relative; flex-shrink: 0; '
            f'background: var(--bg); color: var(--fg); font-family: {UI}; box-shadow: 0 10px 30px rgba(60,30,20,0.12);">{inner}</div>')


def icon_home(icon_html):
    blanks = "".join('<div style="display: flex; flex-direction: column; align-items: center; gap: 6px;"><div style="width: 60px; height: 60px; border-radius: 14px; '
                     'background: rgba(255,255,255,0.22);"></div><span style="width: 34px; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.35);"></span></div>'
                     for _ in range(3))
    return ('<div style="position: relative; width: 330px; height: 132px; border-radius: 30px; overflow: hidden;">' + img("bar") +
            '<div style="position: absolute; inset: 0; background: rgba(10,4,4,0.4);"></div>'
            '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 22px;">'
            f'<div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">{icon_html}<span style="font-size: 11px; color: #fff;">Mesa</span></div>'
            + blanks + '</div></div>')


def icon_cream(size):
    r = round(size * 0.2237)
    return (f'<div style="width: {size}px; height: {size}px; border-radius: {r}px; background: #f5efe4; display: flex; align-items: center; justify-content: center; '
            f'box-shadow: inset 0 0 0 1px rgba(60,30,20,0.12); flex-shrink: 0;"><span style="font-family: {SERIF}; font-size: {round(size * 0.74)}px; line-height: 1; '
            f'color: #210104; padding-top: {round(size * 0.06)}px;">M</span></div>')


def system_board():
    w, h = 2000, 1940
    icons = ('<div style="display: flex; gap: 48px;">'
             + '<div style="display: flex; flex-direction: column; gap: 16px; align-items: flex-start;">' + C.mark(200) + icon_home(C.mark(60))
             + f'<div style="font-size: 15px; font-weight: 650;">B &middot; cream M on the original oxblood</div>'
             f'<div style="font-size: 14px; color: {MUTED}; max-width: 330px; margin-top: -8px;">Your note: darker, and the app&rsquo;s own burgundy (#210104). This is the one the screens use.</div></div>'
             + '<div style="display: flex; flex-direction: column; gap: 16px; align-items: flex-start;">' + icon_cream(200) + icon_home(icon_cream(60))
             + f'<div style="font-size: 15px; font-weight: 650;">B &middot; as previewed, M in the oxblood</div>'
             f'<div style="font-size: 14px; color: {MUTED}; max-width: 330px; margin-top: -8px;">Same letter, the inverse. Say if you meant this one.</div></div></div>')
    lockups = ('<div style="display: flex; flex-direction: column; gap: 12px;">'
               + mini("Day", f'<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;">{C.wordmark(40)}</div>', 420, 130)
               + mini("Night", f'<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;">{C.wordmark(40)}</div>', 420, 130)
               + '</div>')
    pal = (f'<div style="display: flex; flex-direction: column; gap: 22px;"><div><div style="font-size: 15px; font-weight: 650; margin-bottom: 10px;">Afternoon</div>'
           + swatches([("Paper", "#f5efe4"), ("Card", "#ffffff"), ("Ink", "#2a1512"), ("Oxblood", "#210104"), ("Wine &middot; accent", "#5a0a17")])
           + '</div><div><div style="font-size: 15px; font-weight: 650; margin-bottom: 10px;">Candlelit</div>'
           + swatches([("Oxblood", "#210104"), ("Card", "#300b12"), ("Raised", "#3b1018"), ("Cream &middot; accent", "#f1e8da"), ("Muted", "#a58f86")]) + '</div></div>')
    typ = ('<div style="display: flex; flex-direction: column; gap: 12px;">'
           + "".join(f'<div style="display: flex; align-items: baseline; gap: 18px;"><span style="width: 150px; font-size: 13px; color: {MUTED};">{l}</span>'
                     f'<span style="{s}">{t}</span></div>' for l, s, t in [
                         ("Serif &middot; 44 place", f"font-family: {SERIF}; font-size: 44px; line-height: 1;", "O.Livia"),
                         ("Serif &middot; 33 greeting", f"font-family: {SERIF}; font-size: 33px; line-height: 1;", "Good evening, Enrique"),
                         ("Serif &middot; 21 names", f"font-family: {SERIF}; font-size: 21px;", "Segundo Muelle &middot; Lul&uacute; Tasting Bar"),
                         ("Serif &middot; notes", f"font-family: {SERIF}; font-size: 21px;", "&ldquo;El pargo entero. No hay discusi&oacute;n.&rdquo;"),
                         ("SF Pro &middot; 21 sections", "font-size: 21px; font-weight: 650;", "Tonight"),
                         ("SF Pro &middot; 15 body", "font-size: 15px;", "Where are we going tonight?"),
                         ("SF Pro &middot; 12.5 meta", f"font-size: 12.5px; color: {MUTED};", "Peruvian &middot; Naco &middot; $$$")])
           + f'<div style="font-size: 14px; color: {MUTED}; margin-top: 4px;">Upright everywhere &mdash; no italics, notes included.</div></div>')
    words = mini("Day", '<div style="position: absolute; inset: 0; display: flex; align-items: center; gap: 8px; padding: 0 18px;">'
                 + "".join(score_pill(s, "chip", 15) for s in ["9.6", "8.4", "7.2", "5.9", "4.1"]) + '</div>', 560, 80)
    words += '<div style="height: 10px;"></div>' + mini("Night", '<div style="position: absolute; inset: 0; display: flex; align-items: center; gap: 8px; padding: 0 18px;">'
                                                        + "".join(score_pill(s, "chip", 15) for s in ["9.6", "8.4", "7.2", "5.9", "4.1"]) + '</div>', 560, 80)
    words += (f'<div style="font-size: 14px; color: {MUTED}; margin-top: 12px; max-width: 560px;">9+ Must go &middot; 8+ Great &middot; 7+ Good &middot; 5+ Fine &middot; below, Skip. '
              'On photos it sits on smoked glass; in dense rows the word tucks under the number.</div>')
    nophoto = ('<div style="display: flex; gap: 14px;">'
               + mini("Day", A.friend_card(A.FRIENDS[2]).replace("margin: 0 16px 10px", "margin: 0"), 380, 160)
               .replace('overflow: hidden; position: relative; flex-shrink: 0;', 'overflow: hidden; position: relative; flex-shrink: 0; padding: 12px; box-sizing: border-box;')
               + mini("Day", '<div style="padding: 16px; display: flex; gap: 12px; align-items: center;">' + name_card("Cyril Restaurante", 72, 20)
                      + '<div style="font-size: 14px; line-height: 1.4;">No photo, no note &mdash;<br>the name card.</div></div>', 300, 160)
               + mini("Day", f'<div style="position: absolute; inset: 0;">{map_svg(True)}</div>', 220, 160) + '</div>'
               f'<div style="font-size: 14px; color: {MUTED}; margin-top: 12px; max-width: 900px;">Picture rule: the friend&rsquo;s photo &rarr; the place&rsquo;s photo &rarr; '
               'the friend&rsquo;s words set as the picture &rarr; the name card. A place page with no photo opens on its map.</div>')
    comps = ('<div style="display: flex; flex-direction: column; gap: 14px;">'
             + "".join(mini(t, '<div style="position: absolute; left: 0; right: 0; top: 0; height: 160px;">' + img("pizza") + '</div>' + tabbar("feed", 14), 393, 94)
                       for t in ("Day", "Night"))
             + "".join(mini(t, '<div style="position: absolute; inset: 0;"></div>' + rank_bar("Rank it", 12), 393, 94) for t in ("Day", "Night"))
             + "".join(mini(t, '<div style="padding: 22px 0 0;">' + pills(["For you", "Friends", "Popular", "Events", "Lists"]) + '</div>', 393, 80)
                       for t in ("Day", "Night")) + '</div>')
    shares = ('<div style="display: flex; gap: 24px;">' + C.share_card("spot") + C.share_card("list") + '</div>'
              f'<div style="font-size: 14px; color: {MUTED}; margin-top: 12px; max-width: 560px;">The story image stays Candlelit in both themes &mdash; it leaves the app.</div>')
    inner = (f'<div style="width: 100%; height: 100%; box-sizing: border-box; background: {SAND}; color: {INK}; padding: 56px 64px;">'
             + board_head("00 &middot; the system", "Mesa, the parts", "The icon, the wordmark, both palettes, the type, the score, the no-photo rule, and the shared controls.", False)
             + '<div style="display: flex; gap: 80px;">'
             + sys_block("App icon &middot; pick 10", icons) + sys_block("Wordmark", lockups) + sys_block("Share card", shares) + '</div>'
             + '<div style="display: flex; gap: 80px; margin-top: 70px;">'
             + sys_block("Color", pal) + sys_block("Type", typ) + sys_block("Score &middot; pick 07", words) + '</div>'
             + '<div style="display: flex; gap: 80px; margin-top: 70px;">'
             + sys_block("No photo &middot; pick 06", nophoto) + sys_block("Tab bar, rank bar, pills &middot; picks 08, 09, 03", comps) + '</div></div>')
    return "S00-System.dc.html", "The system", w, h, page("Mesa &middot; the system", w, h, inner)


# ---------------------------------------------------------------- start page

PICKS = [("01", "Colors", "Cream by day, oxblood at night"), ("02", "Top of the feed", "Greeting"), ("03", "Pills", "Pills"),
         ("04", "Tonight", "Tall cards"), ("05", "Friends&rsquo; rankings", "Cards"), ("06", "No photo", "Words, name card, map"),
         ("07", "Score", "Number + word"), ("08", "Tab bar", "Active circle"), ("09", "Rank button", "Rank it + save + directions"),
         ("10", "Icon", "M on the original oxblood"), ("11", "Your list", "Podium")]


def main_page(boards):
    w, h = 1480, 1180
    picks = "".join(f'<div style="display: flex; gap: 10px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid rgba(241,232,218,0.1);">'
                    f'<span style="font-size: 12px; font-weight: 700; color: rgba(241,232,218,0.45); width: 22px;">{n}</span>'
                    f'<span style="font-size: 14.5px; color: rgba(241,232,218,0.7); width: 150px;">{t}</span>'
                    f'<span style="font-family: {SERIF}; font-size: 19px;">{v}</span></div>' for n, t, v in PICKS)
    tiles = "".join(f'<a href="{f}" class="tile" style="border-radius: 24px; background: #300b12; color: #f1e8da; padding: 18px 20px; text-decoration: none; '
                    f'display: flex; flex-direction: column; gap: 6px; min-height: 124px; box-sizing: border-box;">'
                    f'<span style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; color: rgba(241,232,218,0.5);">{i:02d}</span>'
                    f'<span style="font-family: {SERIF}; font-size: 27px; line-height: 1.02;">{t}</span>'
                    f'<span style="margin-top: auto; font-size: 13px; color: rgba(241,232,218,0.55);">{n}</span></a>'
                    for i, (f, t, n) in enumerate(boards))
    inner = ('<div style="width: 100%; height: 100%; box-sizing: border-box; background: #210104; color: #f1e8da; padding: 64px 72px; display: flex; gap: 72px;">'
             '<div style="width: 470px; flex-shrink: 0; display: flex; flex-direction: column;">'
             + C.wordmark(34) +
             f'<div style="font-family: {SERIF}; font-size: 60px; line-height: 1; margin-top: 36px;">Every screen, redesigned</div>'
             '<p style="margin: 16px 0 26px; font-size: 16px; line-height: 1.5; color: rgba(241,232,218,0.7);">All of the app &mdash; from your 57 screenshots and '
             'every route in the code &mdash; in the eleven picks. Each board shows Afternoon on top and Candlelit below, so both themes get built.</p>'
             f'<div>{picks}</div></div>'
             '<div style="flex: 1; display: flex; flex-direction: column;">'
             '<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: rgba(241,232,218,0.5); margin-bottom: 14px;">THE BOARDS</div>'
             f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">{tiles}</div>'
             '<div style="margin-top: auto; font-size: 13.5px; line-height: 1.5; color: rgba(241,232,218,0.5);">Photos are the ones Mesa already serves. People, '
             'notes and numbers come from your demo data or are examples.</div></div></div>')
    css = (".tile { transition: transform 150ms ease; } .tile:hover { transform: translateY(-3px); }\n"
           ".tile:focus-visible { outline: 2px solid #f1e8da; outline-offset: 3px; }\n"
           "@media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile:hover { transform: none; } }")
    return "Main.dc.html", "Start here", w, h, page("Mesa redesign", w, h, inner, css)


def main():
    os.makedirs(OUT, exist_ok=True)
    built = [system_board()] + [screen_board(i + 1, *b) for i, b in enumerate(BOARDS)]
    total = sum(len(b[3]) for b in BOARDS)
    index = [("S00-System.dc.html", "The system", "Icon, color, type, controls")] + [
        (b[0], b[1], f"{len(b[3])} screens") for b in BOARDS]
    mp = main_page(index)
    boards, order = {}, []
    boards[mp[0]] = {"x": 0, "y": 0, "w": mp[2], "h": mp[3], "title": "Start here", "is_interactive": True}
    order.append(mp[0])
    y = mp[3] + 440
    notes = {"n1": {"kind": "title1", "maxW": mp[2], "text": "Mesa — every screen, redesigned", "w": 240, "x": 0, "y": -280}}
    for i, (fname, title, w, h, _) in enumerate(built):
        notes[f"t{i}"] = {"kind": "title1", "maxW": w, "text": ("00 · " if i == 0 else f"{i:02d} · ") + title.replace("&rsquo;", "’"), "w": 240, "x": 0, "y": y - 280}
        boards[fname] = {"x": 0, "y": y, "w": w, "h": h, "title": title.replace("&rsquo;", "’")}
        order.append(fname)
        y += h + 440
    remap = json.load(open(os.path.join(HERE, "photos.json")))  # this artifact's own copies of the photos
    for fname, _, _, _, html in [mp] + built:
        for old_url, new_url in remap.items():
            html = html.replace(old_url, new_url)
        with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
            f.write(html)
    canvas = {"v": 3, "attachments": {}, "boards": boards, "createdOnFiles": {"at": "2026-09-29T00:30:00Z", "v": 1}, "designSystems": [],
              "launch": {"file": "Main.dc.html", "view": "focused"}, "notes": notes, "order": order, "pages": [], "title": "Mesa Redesign"}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, indent=1, ensure_ascii=False)
    for fname, _, w, h, html in [mp] + built:
        print(f"{fname:28s} {w}x{h} {len(html) / 1024:7.0f} KB")
    print("screens:", total)


if __name__ == "__main__":
    main()
