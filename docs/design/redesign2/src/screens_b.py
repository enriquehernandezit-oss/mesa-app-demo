"""Profile & people, lists & dishes, plans, events."""
from mesa_ui import (ELL, GL, PGL, SERIF, avatar, btn, card, cta, empty, field, group, ic, img, label, large_title,
                     name_card, pill, pills, row, scrim, score_pill, section, sheet, stack, switch, tabbar, thumb, top_nav, ttext)
from screens_a import (EVENTS, TOP, compare_card, place_top, podium_half, score_stack, section_label)


def action_sheet(title, msg, options, destructive=(), top_screen=""):
    """Native iOS action sheet (chrome, not content) — glass group + a separate Cancel."""
    head = (f'<div style="padding: 14px 18px 12px; text-align: center; border-bottom: 1px solid var(--line);">'
            f'<div style="font-size: 13px; font-weight: 650; color: var(--muted);">{title}</div>'
            + (f'<div style="font-size: 13px; color: var(--muted); margin-top: 4px; line-height: 1.35;">{msg}</div>' if msg else "")
            + '</div>') if title else ""
    opts = "".join(f'<div style="height: 56px; display: flex; align-items: center; justify-content: center; font-size: 19px; '
                   f'{"border-top: 1px solid var(--line);" if i else ""} color: {"var(--danger)" if i in destructive else "var(--fg)"};">{o}</div>'
                   for i, o in enumerate(options))
    return (top_screen + '<div style="position: absolute; inset: 0; background: var(--scrim); z-index: 50;"></div>'
            '<div style="position: absolute; left: 10px; right: 10px; bottom: 34px; z-index: 55; display: flex; flex-direction: column; gap: 8px;">'
            f'<div style="border-radius: 16px; {GL} overflow: hidden;">{head}{opts}</div>'
            f'<div style="height: 56px; border-radius: 16px; background: var(--card); display: flex; align-items: center; justify-content: center; '
            'font-size: 19px; font-weight: 650;">Cancel</div></div>')


def follow_pill(on=False):
    return cta("Following" if on else "Follow", "chip" if on else "solid", h=34, size=13, grow=False)


def person(letter, tone, name, sub, right=None, size=42):
    return (f'<div style="display: flex; align-items: center; gap: 12px; padding: 10px 0;">{avatar(letter, size, tone)}'
            f'{ttext(name, sub, None, 18)}{right or ""}</div>')


def people_card(rows):
    return group(rows)


# ================================================================ PROFILE

def mini_podium():
    tiles = [(1, None, "Cyril Restaurante", "9.6"), (2, "steak", "Chef Pepper", "9.6"), (3, None, "Forno Bravo", "9.6")]
    return ('<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 0 16px;">'
            + "".join(podium_half(n, p, name, s).replace("height: 146px", "height: 132px").replace("font-size: 90px", "font-size: 70px")
                      .replace("left: 58px", "left: 12px").replace("bottom: 14px; font-family", "bottom: 58px; font-family")
                      for n, p, name, s in tiles) + '</div>')


def profile_stats(items):
    return ('<div style="margin: 18px 16px 0; display: flex; border-radius: 22px; background: var(--card); box-shadow: var(--lift); padding: 14px 0;">'
            + "".join(f'<div style="flex: 1; text-align: center; {"border-left: 1px solid var(--line);" if i else ""}">'
                      f'<div style="font-family: {SERIF}; font-size: 26px; line-height: 1;">{v}</div>'
                      f'<div style="font-size: 12px; color: var(--muted); margin-top: 4px;">{l}</div></div>' for i, (v, l) in enumerate(items)) + '</div>')


def profile_me():
    body = (TOP + '<div style="display: flex; justify-content: flex-end; gap: 8px; padding: 0 16px;">' + btn("share", 42, "chip", "Share profile")
            + btn("gear", 42, "chip", "Settings") + '</div>'
            '<div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 24px; margin-top: -10px;">'
            f'<div style="position: relative;">{avatar("E", 92, 0)}<span style="position: absolute; right: -2px; bottom: 2px;">{btn("camera", 30, "solid", "Change photo")}</span></div>'
            f'<div style="font-family: {SERIF}; font-size: 34px; line-height: 1; margin-top: 12px;">Enrique Hern&aacute;ndez</div>'
            '<div style="font-size: 13.5px; color: var(--muted); margin-top: 6px;">@enriquehdz &#183; Piantini &#183; since Sep 2026</div>'
            f'<div style="font-family: {SERIF}; font-size: 19px; line-height: 1.2; margin-top: 10px; color: var(--fg2);">You mostly eat Italian, almost always in Piantini.</div></div>'
            + profile_stats([("160", "Ranked"), ("0", "Followers"), ("9", "Following"), ("2", "Week streak")])
            + '<div style="display: flex; gap: 8px; padding: 12px 16px 0;">' + cta("Edit profile", "chip", h=44, size=14.5) + cta("Find friends", "chip", "user_plus", 44, size=14.5) + '</div>'
            + section("Your top 3", "See your list", pad="22px 20px 12px") + mini_podium())
    return body + tabbar("profile")


def profile_more():
    head = (f'<div style="position: absolute; top: 0; left: 0; right: 0; padding: 58px 16px 10px; {GL} border-width: 0 0 1px 0; z-index: 30; '
            'display: flex; align-items: center; justify-content: space-between;">'
            f'<span style="width: 84px;"></span><span style="font-size: 16px; font-weight: 650;">Enrique Hern&aacute;ndez</span>'
            '<div style="display: flex; gap: 8px;">' + btn("share", 38, "chip") + btn("gear", 38, "chip") + '</div></div>')
    rows = [row(t, None, i) for t, i in [("Ranked", "check"), ("Saved", "bookmark"), ("Your lists", "list"), ("Your dishes", "feed"),
                                         ("Plans", "calendar"), ("Explore spots", "explore")]]
    tiles = "".join(f'<div style="flex: 1; border-radius: 22px; background: var(--card); box-shadow: var(--lift); padding: 14px 16px;">'
                    f'<div style="font-size: 12.5px; color: var(--muted);">{l}</div><div style="font-family: {SERIF}; font-size: 34px; line-height: 1; margin-top: 6px;">{v}</div></div>'
                    for l, v in [("Rank in the DR", "#1"), ("This month", "12 new")])
    body = ('<div style="height: 110px;"></div>' + mini_podium() + '<div style="height: 16px;"></div>' + group(rows)
            + f'<div style="display: flex; gap: 8px; padding: 12px 16px 0;">{tiles}</div>')
    return body + head + tabbar("profile")


FAVS = [("branzino", "O.Livia", "Mediterranean &#183; Piantini", "9.6", "Order: pargo entero", "El pargo entero. No hay discusi&oacute;n."),
        ("steak", "El Mes&oacute;n de la Cava", "Steakhouse &#183; Serrall&eacute;s", "9.6", "Order: short rib", "Falls apart under the fork."),
        (None, "Forno Bravo &ndash; Naco", "Italian &#183; Naco", "9.1", None, None),
        ("mofongo", "Adrian Tropical", "Dominican &#183; Bella Vista", "7.2", None, None)]


def fav_row(n, p, name, meta, s, order, note):
    o = f'<div style="font-size: 12.5px; color: var(--fg2); margin-top: 3px;">{order}</div>' if order else ""
    q = f'<div style="font-family: {SERIF}; font-size: 17px; line-height: 1.2; margin-top: 4px;">&ldquo;{note}&rdquo;</div>' if note else ""
    return ('<div style="display: flex; gap: 12px; align-items: flex-start; margin: 0 16px 8px; padding: 12px 14px 12px 12px; border-radius: 22px; '
            'background: var(--card); box-shadow: var(--lift);">'
            f'<span style="font-family: {SERIF}; font-size: 20px; width: 16px; color: {"var(--fg)" if n <= 3 else "var(--faint)"}; text-align: center; padding-top: 14px;">{n}</span>'
            + thumb(p, name, 52, 16) +
            f'<div style="flex: 1; min-width: 0;"><div style="font-family: {SERIF}; font-size: 19px; line-height: 1.05; {ELL}">{name}</div>'
            f'<div style="font-size: 12.5px; color: var(--muted); margin-top: 3px;">{meta}</div>{o}{q}</div>{score_stack(s, 20)}</div>')


def member_profile():
    body = (top_nav(None, "back", ["more"]) + '<div style="height: 104px;"></div>'
            '<div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 24px;">' + avatar("D", 88, 0) +
            f'<div style="font-family: {SERIF}; font-size: 32px; line-height: 1; margin-top: 12px;">Diego Read</div>'
            '<div style="font-size: 13.5px; color: var(--muted); margin-top: 5px;">@dieguito &#183; Naco</div>'
            '<div style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">'
            '<span style="height: 32px; padding: 0 13px; border-radius: 16px; background: var(--accent); color: var(--on-accent); font-size: 13.5px; '
            'font-weight: 700; display: flex; align-items: center;">+82% taste match</span>'
            '<span style="font-size: 12.5px; color: var(--muted);">across 12 shared spots</span></div></div>'
            + profile_stats([("24", "Followers"), ("31", "Following"), ("7", "Ranked")])
            + f'<div style="display: flex; justify-content: center; padding: 14px 0 0;">{cta("Follow", "solid", "user_plus", 46, grow=False, size=15)}</div>'
            + section("Diego&rsquo;s favorites", "All 7", pad="22px 20px 12px")
            + "".join(fav_row(i + 1, *f) for i, f in enumerate(FAVS[:3])))
    return body


def member_menu():
    return action_sheet("Diego Read", None, ["Report", "Block"], (1,), member_profile())


def member_report():
    return action_sheet("Why are you reporting this person?", None, ["Spam", "Harassment", "Inappropriate", "Other"], (), member_profile())


def member_block():
    return action_sheet("Block Diego?", "You won&rsquo;t see their content and they won&rsquo;t see yours. You can unblock later in Settings.",
                        ["Block"], (0,), member_profile())


def taste_match():
    def both(p, name, meta, mine, theirs):
        return ('<div style="display: flex; align-items: center; gap: 12px; margin: 0 16px 8px; padding: 10px 12px; border-radius: 22px; '
                'background: var(--card); box-shadow: var(--lift);">' + thumb(p, name, 48, 15) + ttext(name, meta, None, 18) +
                f'<div style="text-align: center;"><div style="font-family: {SERIF}; font-size: 20px; line-height: 1;">{mine}</div>'
                '<div style="font-size: 10.5px; color: var(--muted); margin-top: 2px;">You</div></div>'
                f'<div style="text-align: center;"><div style="font-family: {SERIF}; font-size: 20px; line-height: 1;">{theirs}</div>'
                '<div style="font-size: 10.5px; color: var(--muted); margin-top: 2px;">Diego</div></div></div>')
    body = (top_nav("Diego Read") + '<div style="height: 110px;"></div>'
            '<div style="display: flex; flex-direction: column; align-items: center; text-align: center;">'
            f'<div style="display: flex;">{avatar("E", 64, 0, "var(--bg)")}<div style="margin-left: -16px;">{avatar("D", 64, 3, "var(--bg)")}</div></div>'
            f'<div style="font-family: {SERIF}; font-size: 26px; margin-top: 12px;">You and Diego</div>'
            f'<div style="font-family: {SERIF}; font-size: 86px; line-height: 0.9; margin-top: 4px;">82%</div>'
            '<div style="font-size: 13.5px; color: var(--muted); margin-top: 6px;">Based on 12 shared spots</div>'
            '<div style="font-size: 13.5px; font-weight: 650; margin-top: 8px;">How this is calculated</div></div>'
            + section_label("Shared taste")
            + '<div style="display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px;">'
            + "".join(pill(t, h=30) for t in ["Italian", "Seafood", "Piantini", "Naco"]) + '</div>'
            + section_label("Where you agree")
            + both("branzino", "O.Livia", "Mediterranean &#183; Piantini", "9.4", "9.6")
            + both("ceviche", "Segundo Muelle", "Peruvian &#183; Naco", "9.0", "9.1")
            + section_label("Where you don&rsquo;t")
            + both("mofongo", "Adrian Tropical", "Dominican &#183; Bella Vista", "9.3", "7.2"))
    return body


def followers():
    rows = [person("L", 1, "Luc&iacute;a Fern&aacute;ndez", "@lucia &#183; Naco", follow_pill()),
            person("N", 3, "Natalia Cruz", "@nati &#183; Bella Vista", follow_pill(True)),
            person("I", 4, "Isabela Guerrero", "@isa &#183; Zona Colonial", follow_pill(True)),
            person("C", 5, "Carolina Obj&iacute;o", "@caro &#183; Piantini", follow_pill()),
            person("M", 2, "Mateo Bonetti", "@mateo &#183; Piantini", follow_pill(True))]
    return (top_nav("Diego&rsquo;s people") + '<div style="height: 110px;"></div>' + pills(["Followers", "Following"], 0, pad="0 20px 14px")
            + group(rows))


def find_friends():
    invite = card('<div style="display: flex; align-items: center; gap: 14px;">' + btn("share", 46, "accent", "Invite") +
                  '<div style="flex: 1;"><div style="font-size: 16.5px; font-weight: 650;">Invite your friends</div>'
                  '<div style="font-size: 13.5px; color: var(--muted); margin-top: 2px;">Share your invite link on WhatsApp.</div></div></div>', "14px 16px")
    contacts = card('<div style="font-size: 16.5px; font-weight: 650;">Contacts</div>'
                    '<div style="display: flex; align-items: center; gap: 12px; margin-top: 10px;"><div style="flex: 1;">'
                    '<div style="font-size: 15px;">Let your contacts find you</div>'
                    '<div style="font-size: 13px; color: var(--muted); margin-top: 2px; line-height: 1.35;">We store your number encrypted &mdash; we never show it.</div></div>'
                    + switch(False) + '</div><div style="margin-top: 14px; display: flex;">' + cta("Search my contacts", "chip", "users", 44, size=14.5) + '</div>',
                    "16px", "10px 16px 0")
    insta = card(row("Instagram", None, "at", True, sub="Find people you already follow on Instagram."), "4px 16px", "10px 16px 0")
    pymk = group([person("M", 3, "Manuel Reyes", "Isabela Guerrero and 1 other", btn("close", 30, "ghost") + follow_pill()),
                  person("L", 4, "Luis Castillo", "Luc&iacute;a Fern&aacute;ndez and 2 others", btn("close", 30, "ghost") + follow_pill())])
    return (top_nav() + large_title("Find friends", top=112) + '<div style="height: 16px;"></div>' + invite + contacts + insta
            + section("People you may know", None, pad="22px 20px 10px") + pymk.replace("</div></div></div>", "</div></div></div>", 1)).replace(
        'gap: 12px; padding: 10px 0;">', 'gap: 10px; padding: 10px 0;">')


def instagram():
    steps = ["Open Instagram and go to your profile.",
             "Tap the menu &rarr; Your activity &rarr; Download your information.",
             "Choose JSON format and select only &ldquo;Followers and following&rdquo;.",
             "When Instagram emails you the file (can take a few hours), download it and pick it here."]
    st = "".join(f'<div style="display: flex; gap: 12px; padding: 7px 0;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--solid); '
                 f'color: var(--on-solid); font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">{i + 1}</span>'
                 f'<span style="font-size: 14.5px; line-height: 1.4;">{t}</span></div>' for i, t in enumerate(steps))
    return (top_nav() + large_title("Import from Instagram", "Find people you already follow on Instagram, without connecting your account.", top=112, size=34)
            + card('<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding-bottom: 4px;">How to download your information</div>' + st, "16px", "18px 16px 0")
            + f'<div style="display: flex; padding: 14px 16px 0;">{cta("Choose file", "solid", "download")}</div>'
            + section_label("6 matches on Mesa")
            + group([person("V", 2, "Valentina P&eacute;rez", "Matches @valen from your Instagram", follow_pill()),
                     person("R", 5, "Rafael Then", "Matches @rafathen from your Instagram", follow_pill())]))


def form_label(t):
    return f'<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding: 16px 20px 7px;">{t}</div>'


HOODS = ["Bella Vista", "Evaristo Morales", "Gazcue", "Naco", "Piantini", "Serrall&eacute;s", "Zona Colonial"]


def chips_wrap(items, on=(), h=34):
    return ('<div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px;">' + "".join(pill(t, t in on, h=h) for t in items) + '</div>')


def edit_profile():
    return (top_nav("Edit profile") + '<div style="height: 110px;"></div>'
            f'<div style="display: flex; justify-content: center;"><div style="position: relative;">{avatar("E", 84, 0)}'
            f'<span style="position: absolute; right: -2px; bottom: 0;">{btn("camera", 30, "solid", "Change photo")}</span></div></div>'
            + form_label("Name") + f'<div style="padding: 0 16px;">{field("", "Enrique Hern&aacute;ndez")}</div>'
            + form_label("Username &#183; optional") + f'<div style="padding: 0 16px;">{field("", "@enriquehdz")}</div>'
            + form_label("Instagram &#183; optional") + f'<div style="padding: 0 16px;">{field("yourusername", icon="at")}</div>'
            + form_label("Website &#183; optional") + f'<div style="padding: 0 16px;">{field("yoursite.com", icon="globe")}</div>'
            + form_label("Neighborhood") + chips_wrap(HOODS, ("Piantini",)))


def edit_profile_more():
    cuisines = ["Contemporary", "Italian", "Spanish", "Basque", "Peruvian", "Wine Bar", "Dominican", "Steakhouse", "Mediterranean",
                "Japanese", "Seafood", "Caf&eacute;", "French", "Asian"]
    return (top_nav("Edit profile") + '<div style="height: 96px;"></div>'
            + form_label("Go-to neighborhoods") + chips_wrap(HOODS, ("Naco", "Piantini", "Bella Vista"))
            + form_label("Favorite cuisines") + chips_wrap(cuisines, ("Italian", "Peruvian", "Seafood", "Wine Bar"))
            + form_label("Bio") + f'<div style="padding: 0 16px;">{field("", "Rankeando Santo Domingo, un plato a la vez.")}</div>'
            + f'<div style="position: absolute; left: 16px; right: 16px; bottom: 34px; display: flex;">{cta("Save", "solid")}</div>')


# ================================================================ LISTS & DISHES

def featured_list():
    hero = ('<div style="position: relative; height: 300px;">' + img("bar") +
            '<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 100px; background: linear-gradient(to bottom, rgba(0,0,0,0), var(--bg));"></div>'
            + top_nav(None, "back", ["share"], "photo") + '</div>')
    rows = [("bar", "Vesuvio Sarasota", "Italian &#183; Bella Vista &#183; $$$", "8.4"), ("pizza", "Pizzarelli", "Pizza &#183; Bella Vista &#183; $$", "7.7"),
            ("pasta", "La Locanda", "Italian &#183; Piantini &#183; $$$", "8.2"), ("pasta", "Casa Luca", "Italian &#183; Piantini &#183; $$$$", "9.2")]
    return (hero + '<div style="padding: 0 20px; margin-top: -14px; position: relative;">'
            '<div style="font-size: 13px; font-weight: 600; color: var(--muted);">Featured &#183; 9 spots</div>'
            f'<div style="font-family: {SERIF}; font-size: 40px; line-height: 1; margin-top: 4px;">La Dolce Vita</div>'
            '<div style="font-size: 15px; color: var(--fg2); margin-top: 6px;">Pasta, pizza y vino tinto</div>'
            f'<div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13.5px; color: var(--muted);">{avatar("G", 24, 2)}by @greciaeats'
            '<span style="margin-left: auto; font-weight: 650; color: var(--fg);">How we made it</span></div></div>'
            '<div style="height: 14px;"></div>'
            + "".join(f'<div style="display: flex; align-items: center; gap: 12px; margin: 0 16px 8px; padding: 10px 14px 10px 12px; border-radius: 22px; '
                      f'background: var(--card); box-shadow: var(--lift);"><span style="font-family: {SERIF}; font-size: 19px; width: 16px; color: var(--muted); text-align: center;">{i + 1}</span>'
                      + thumb(p, n, 50, 15) + ttext(n, m, None, 18) + score_stack(s, 20) + '</div>' for i, (p, n, m, s) in enumerate(rows)))


def your_lists():
    def tile(p, name, n):
        top = f'<div style="height: 124px; border-radius: 22px; overflow: hidden;">{img(p)}</div>' if p else name_card(name, 124, 22, 22).replace("width: 124px; height: 124px;", "width: 100%; height: 124px;")
        return (f'<div>{top}<div style="font-family: {SERIF}; font-size: 19px; margin-top: 8px; {ELL}">{name}</div>'
                f'<div style="font-size: 12.5px; color: var(--muted);">{n} saved</div></div>')
    new = ('<div><div style="height: 124px; border-radius: 22px; border: 1.5px dashed var(--line); display: flex; flex-direction: column; align-items: center; '
           f'justify-content: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--fg2);">{ic("plus", 22, 2)}New list</div></div>')
    return (top_nav() + large_title("Your lists", top=112) +
            '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; padding: 18px 16px 0;">'
            + new + tile("pasta", "Pasta night", 6) + tile("cocktails", "Drinks after work", 4) + tile(None, "Para impresionar", 3)
            + tile("dessert", "Postres", 5) + tile("branzino", "Seafood", 7) + '</div>')


def one_list():
    rows = [("pasta", "La Locanda", "Italian &#183; Piantini", '<div style="text-align: right;"><div style="font-family: ' + SERIF + '; font-size: 20px; line-height: 1;">8.2</div>'
             '<div style="font-size: 11px; color: var(--muted); margin-top: 2px;">You went &#183; #41</div></div>'),
            (None, "Nonna Julia", "Pizza &#183; Piantini", '<span style="font-size: 13px; font-weight: 600; color: var(--danger);">Remove</span>'),
            ("bar", "Vesuvio Sarasota", "Italian &#183; Bella Vista", '<div style="text-align: right;"><div style="font-family: ' + SERIF + '; font-size: 20px; line-height: 1;">8.8</div>'
             '<div style="font-size: 11px; color: var(--muted); margin-top: 2px;">You went &#183; #82</div></div>')]
    return (top_nav(None, "back", ["share", "more"]) + '<div style="height: 110px;"></div>'
            '<div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 24px;">'
            f'<div style="width: 160px; height: 160px; border-radius: 30px; overflow: hidden; box-shadow: 0 16px 40px rgba(33,1,4,0.2);">{img("pasta")}</div>'
            f'<div style="font-family: {SERIF}; font-size: 34px; line-height: 1; margin-top: 16px;">Pasta night</div>'
            '<div style="font-size: 13.5px; color: var(--muted); margin-top: 5px;">6 saved</div>'
            '<div style="font-size: 15px; color: var(--fg2); margin-top: 8px; line-height: 1.4;">Para cuando el plan es pasta fresca y una botella de tinto.</div></div>'
            '<div style="height: 18px;"></div>'
            + "".join('<div style="display: flex; align-items: center; gap: 12px; margin: 0 16px 8px; padding: 10px 14px 10px 12px; border-radius: 22px; '
                      'background: var(--card); box-shadow: var(--lift);">' + thumb(p, n, 50, 15) + ttext(n, m, None, 18) + r + '</div>' for p, n, m, r in rows))


def save_to_list():
    def lrow(name, n, on=False):
        c = (f'<span style="width: 26px; height: 26px; border-radius: 50%; background: var(--solid); color: var(--on-solid); display: flex; '
             f'align-items: center; justify-content: center;">{ic("check", 15, 2.4)}</span>' if on else
             '<span style="width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid var(--faint);"></span>')
        return row(name, None, None, False, c, f"{n} saved")
    inner = ('<div style="padding: 4px 20px 14px;"><div style="font-size: 13px; font-weight: 600; color: var(--muted);">O.Livia</div>'
             f'<div style="font-family: {SERIF}; font-size: 32px; line-height: 1; margin-top: 4px;">Add to a list</div>'
             '<div style="font-size: 14px; color: var(--muted); margin-top: 6px;">It&rsquo;s in Want to try. Add it to one of your lists too.</div></div>'
             + group([lrow("Seafood", 7, True), lrow("Para impresionar", 3), lrow("Drinks after work", 4)])
             + card('<div style="font-size: 13px; font-weight: 600; color: var(--muted);">New list</div>'
                    '<div style="display: flex; gap: 12px; align-items: center; margin-top: 10px;">'
                    f'<div style="width: 64px; height: 64px; border-radius: 18px; border: 1.5px dashed var(--line); display: flex; flex-direction: column; align-items: center; '
                    f'justify-content: center; font-size: 11px; color: var(--muted); gap: 2px;">{ic("plus", 18, 2)}Cover</div>'
                    f'<div style="flex: 1; font-family: {SERIF}; font-size: 22px; color: var(--faint); border-bottom: 1px solid var(--line); padding-bottom: 6px;">List name</div></div>'
                    '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">'
                    + "".join(pill(t, h=30) for t in ["Pizza", "Date night", "Brunch", "With friends", "To impress"]) + '</div>'
                    f'<div style="display: flex; margin-top: 14px;">{cta("Create", "solid", h=46, size=15)}</div>', "16px", "12px 16px 0"))
    return place_top() + sheet(inner, 150, None)


def your_dishes():
    nudge = ('<div style="margin: 18px 16px 0; padding: 14px 16px; border-radius: 22px; background: var(--solid); color: var(--on-solid); display: flex; '
             'align-items: center; gap: 12px;"><div style="flex: 1;">'
             f'<div style="font-family: {SERIF}; font-size: 21px; line-height: 1.1;">You&rsquo;ve had pizza at 3 places</div>'
             '<div style="font-size: 13px; opacity: 0.7; margin-top: 3px;">Take a minute to rank them.</div></div>'
             '<span style="height: 34px; padding: 0 14px; border-radius: 17px; background: var(--bg); color: var(--fg); font-size: 13px; font-weight: 650; '
             'display: flex; align-items: center;">Rank</span></div>')
    rk = cta("Rank", "chip", h=32, size=12.5, grow=False)
    rows = [row(f'<span style="font-family: {SERIF}; font-size: 20px;">Pizza</span>', None, None, True, None, "3 ranked"),
            row(f'<span style="font-family: {SERIF}; font-size: 20px;">Short rib</span>', None, None, True, None, "2 ranked"),
            row(f'<span style="font-family: {SERIF}; font-size: 20px;">Ceviche</span>', None, None, False, rk, "Not ranked yet"),
            row(f'<span style="font-family: {SERIF}; font-size: 20px;">Carbonara</span>', None, None, False, rk, "Not ranked yet")]
    return top_nav() + large_title("Your dishes", top=112) + nudge + '<div style="height: 12px;"></div>' + group(rows)


def dish_ranking():
    rows = [("pizza", "Vesuvio Sarasota", "Italian &#183; Bella Vista", "Margherita, wood-fired"), ("pizza", "Pizzarelli", "Pizza &#183; Bella Vista", "Diavola"),
            (None, "Detroit Pizza", "Pizza &#183; Naco", "Detroit-style pepperoni")]
    return (top_nav(None, "back", ["share"]) + large_title("Your best pizza", "3 ranked", top=112)
            + '<div style="height: 12px;"></div>'
            + "".join(f'<div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; margin: 0 20px; border-bottom: 1px solid var(--line);">'
                      f'<span style="font-family: {SERIF}; font-size: 26px; width: 24px; color: var(--muted);">{i + 1}</span>' + thumb(p, n, 56, 16)
                      + ttext(n, m, d, 19) + '</div>' for i, (p, n, m, d) in enumerate(rows))
            + section_label("2 to rank")
            + "".join(f'<div style="display: flex; align-items: center; gap: 12px; padding: 8px 20px; opacity: 0.7;">{thumb(p, n, 48, 14)}{ttext(n, m, None, 18)}</div>'
                      for p, n, m in [(None, "Nonna Julia", "Pizza &#183; Piantini"), ("pizza", "Bottega Fratelli", "Pizza &#183; Piantini")])
            + f'<div style="display: flex; padding: 12px 16px 0;">{cta("Rank 2 more", "solid")}</div>')


def dish_rank():
    inner = ('<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 16px 6px;">' + btn("back", 38, "chip", "Back")
             + '<span style="font-size: 13px; font-weight: 600; color: var(--muted);">1 of 2</span>' + btn("close", 38, "chip", "Close") + '</div>'
             f'<div style="text-align: center; padding: 10px 20px 14px; font-family: {SERIF}; font-size: 32px; line-height: 1;">Which pizza was better?</div>'
             + compare_card(None, "Nonna Julia", "Pizza &#183; Piantini &#183; $$", "Loved it")
             + f'<div style="display: flex; justify-content: center; padding: 10px 0;">{cta("About the same", "chip", h=40, size=14, grow=False)}</div>'
             + compare_card("pizza", "Pizzarelli", "Pizza &#183; Bella Vista &#183; $$", "#2 on your list"))
    return dish_ranking() + sheet(inner, 66, None)


def post_dish():
    inner = ('<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 16px 4px;">'
             '<span style="font-size: 16px; font-weight: 550;">Cancel</span><span style="font-size: 16px; font-weight: 650;">Post a dish</span>'
             '<span style="width: 50px;"></span></div>'
             f'<div style="padding: 14px 20px 0;"><div style="font-family: {SERIF}; font-size: 30px; border-bottom: 1px solid var(--line); padding-bottom: 8px;">Margherita, wood-fired</div>'
             '<div style="font-size: 12px; color: var(--muted); margin-top: 5px;">Dish name</div></div>'
             '<div style="display: flex; gap: 8px; padding: 12px 20px 0;">' + pill("Italian", True, chevron=True, h=32) + pill("Pizza", True, chevron=True, h=32) + '</div>'
             '<div style="display: flex; gap: 12px; padding: 14px 16px 0;">'
             f'<div style="width: 150px; height: 150px; border-radius: 22px; overflow: hidden; position: relative; flex-shrink: 0;">{img("pizza")}'
             f'<span style="position: absolute; left: 8px; bottom: 8px; height: 22px; padding: 0 8px; border-radius: 11px; {PGL} font-size: 11px; font-weight: 600; '
             'display: flex; align-items: center;">film &#183; Candlelit</span></div>'
             '<div style="flex: 1; display: flex; flex-direction: column; gap: 8px;"><div style="font-size: 12.5px; font-weight: 600; color: var(--muted);">Grain</div>'
             + pill("Candlelit", True, h=32) + pill("Daylight", h=32) + pill("None", h=32) + '</div></div>'
             + form_label("Your comment") + f'<div style="padding: 0 16px;">{field("Write a comment&hellip; e.g. falls apart with a fork")}</div>'
             + form_label("Linked ranking")
             + card('<div style="display: flex; align-items: center; gap: 12px;">' + ttext("Vesuvio Sarasota", "Italian &#183; Bella Vista", None, 18)
                    + score_stack("8.8", 20) + '</div>', "12px 14px")
             + '<div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 20px 0; font-size: 15px;">Share with friends only' + switch(True) + '</div>')
    foot = f'<div style="position: absolute; left: 16px; right: 16px; bottom: 30px; display: flex; z-index: 60;">{cta("Post dish", "solid")}</div>'
    return place_top() + sheet(inner, 66, None) + foot


def all_dishes():
    def d(p, n, by, c):
        top = f'<div style="height: 168px; border-radius: 22px; overflow: hidden;">{img(p)}</div>' if p else name_card(n, 168, 22, 22).replace("width: 168px; height: 168px;", "width: 100%; height: 168px;")
        return (f'<div>{top}<div style="font-family: {SERIF}; font-size: 18px; margin-top: 7px; {ELL}">{n}</div>'
                f'<div style="display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; color: var(--muted);">by {by}'
                f'<span style="display: flex; align-items: center; gap: 4px;">{ic("heart", 15, 1.9)}{c}</span></div></div>')
    return (top_nav() + large_title("Dishes", "Vesuvio Sarasota", top=112)
            + '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; padding: 18px 16px 0;">'
            + d("steak", "Steak", "you", 3) + d("pizza", "Margherita, wood-fired", "Valentina", 8) + d(None, "Tiramis&ugrave; de la casa", "Natalia", 2)
            + d("pasta", "Cacio e pepe", "Diego", 5) + '</div>')


# ================================================================ PLANS

def status_badge(t, strong=False):
    look = "background: var(--solid); color: var(--on-solid);" if strong else "background: var(--accent-soft); color: var(--fg);"
    return (f'<span style="height: 24px; padding: 0 10px; border-radius: 12px; {look} font-size: 11.5px; font-weight: 700; '
            f'display: flex; align-items: center; white-space: nowrap;">{t}</span>')


def plan_row(p, title, date, sub, badge, strong=False):
    return ('<div style="display: flex; align-items: center; gap: 12px; margin: 0 16px 8px; padding: 10px 12px; border-radius: 22px; '
            'background: var(--card); box-shadow: var(--lift);">' + thumb(p, title, 56, 16)
            + f'<div style="flex: 1; min-width: 0;"><div style="font-family: {SERIF}; font-size: 19px; line-height: 1.05; {ELL}">{title}</div>'
            f'<div style="font-size: 12.5px; color: var(--fg2); margin-top: 3px;">{date}</div>'
            f'<div style="font-size: 12px; color: var(--muted); margin-top: 1px;">{sub}</div></div>' + status_badge(badge, strong) + '</div>')


def plans():
    return (top_nav(None, "back", None) + large_title("Plans", top=112, right=cta("New", "solid", "plus", 40, grow=False, size=14))
            + section_label("Pending invites")
            + plan_row("ceviche", "Segundo Muelle", "Sat, Oct 3 &#183; 8:00 PM", "Hosted by Diego Read", "Pending", True)
            + section_label("Upcoming")
            + plan_row("tapas", "3 options &#183; vote", "Fri, Oct 2 &#183; 9:00 PM", "4 going &#183; 1 maybe", "Hosting")
            + plan_row("bar", "Vesuvio Sarasota", "Thu, Oct 8 &#183; 8:30 PM", "Hosted by Luc&iacute;a", "I&rsquo;m going")
            + section_label("Past")
            + plan_row("steak", "El Mes&oacute;n de la Cava", "Sat, Sep 19 &#183; 9:00 PM", "Hosted by you", "Already happened"))


def plan_detail():
    hero = ('<div style="position: relative; height: 220px;">' + img("tapas") +
            '<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 90px; background: linear-gradient(to bottom, rgba(0,0,0,0), var(--bg));"></div>'
            + top_nav(None, "back", ["share"], "photo") + '</div>')

    def opt(p, n, v, mine=False):
        chk = (f'<span style="width: 26px; height: 26px; border-radius: 50%; background: var(--solid); color: var(--on-solid); display: flex; align-items: center; '
               f'justify-content: center;">{ic("check", 15, 2.4)}</span>' if mine else '<span style="width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid var(--faint);"></span>')
        return (f'<div style="display: flex; align-items: center; gap: 12px; padding: 8px 0;">{thumb(p, n, 46, 14)}'
                f'{ttext(n, f"{v} vote" + ("" if v == 1 else "s"), None, 18)}{chk}</div>')
    guests = [("E", 0, "You", "Host"), ("L", 1, "Luc&iacute;a Fern&aacute;ndez", "voted Lul&uacute;"), ("N", 3, "Natalia Cruz", "voted Lul&uacute;")]
    return (hero + '<div style="padding: 0 20px; margin-top: -10px; position: relative;">'
            f'<div style="font-family: {SERIF}; font-size: 36px; line-height: 1;">Vote open</div>'
            '<div style="font-size: 14px; color: var(--fg2); margin-top: 6px;">Fri, Oct 2 &#183; 9:00 PM &#183; Hosted by you</div>'
            f'<div style="font-family: {SERIF}; font-size: 18px; color: var(--fg2); margin-top: 8px;">&ldquo;Cumple de Luc&iacute;a &mdash; vota antes del jueves.&rdquo;</div></div>'
            + section_label("Vote")
            + card(opt("tapas", "Lul&uacute; Tasting Bar", 3, True) + opt("ceviche", "Segundo Muelle", 1) + opt("bar", "Vesuvio Sarasota", 0)
                   + f'<div style="display: flex; margin-top: 8px;">{cta("Confirm spot", "chip", h=42, size=14)}</div>', "8px 14px 12px")
            + section_label("Going (3)")
            + group([person(l, t, n, None, status_badge(b), 34) for l, t, n, b in guests]))


def plan_step(step_title, body, button="Continue", back="close"):
    head = ('<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 16px 4px;">' + btn(back, 38, "chip")
            + '<span style="font-size: 14px; font-weight: 650; color: var(--muted);">New table</span><span style="width: 38px;"></span></div>'
            f'<div style="font-family: {SERIF}; font-size: 36px; line-height: 1; padding: 12px 20px 0;">{step_title}</div>')
    foot = f'<div style="position: absolute; left: 16px; right: 16px; bottom: 30px; display: flex; z-index: 60;">{cta(button, "solid")}</div>'
    return plans() + sheet(head + body, 66, None) + foot


def plan_where():
    def r(p, n, m, on=False):
        c = (f'<span style="width: 26px; height: 26px; border-radius: 50%; background: var(--solid); color: var(--on-solid); display: flex; align-items: center; '
             f'justify-content: center;">{ic("check", 15, 2.4)}</span>' if on else '<span style="width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid var(--faint);"></span>')
        return f'<div style="display: flex; align-items: center; gap: 12px; padding: 8px 20px;">{thumb(p, n, 52, 16)}{ttext(n, m, None, 19)}{c}</div>'
    body = (f'<div style="padding: 14px 16px 0;">{field("Search a spot&hellip;", icon="search", h=48)}</div>'
            '<div style="display: flex; gap: 8px; padding: 12px 20px 0;">' + pill("Lul&uacute; &#215;", True, h=32) + pill("Segundo Muelle &#215;", True, h=32) + '</div>'
            '<div style="font-size: 12.5px; color: var(--muted); padding: 10px 20px 6px;">1 spot = fixed &#183; 2&ndash;3 = vote</div>'
            + r("tapas", "Lul&uacute; Tasting Bar", "Tapas &#183; Zona Colonial", True) + r("ceviche", "Segundo Muelle", "Peruvian &#183; Naco", True)
            + r("bar", "Vesuvio Sarasota", "Italian &#183; Bella Vista") + r(None, "Cyril Restaurante", "Contemporary &#183; Piantini"))
    return plan_step("Where?", body)


def plan_when():
    days = [("Today", True), ("Tomorrow", False), ("Wed 30", False), ("Thu 1", False), ("Fri 2", False)]
    times = ["7:00 pm", "7:30 pm", "8:00 pm", "8:30 pm", "9:00 pm", "9:30 pm", "10:00 pm", "10:30 pm", "11:00 pm"]
    body = ('<div style="display: flex; gap: 8px; padding: 16px 20px 0; overflow: hidden;">' + "".join(pill(d, a, h=36) for d, a in days) + '</div>'
            + form_label("Time") + '<div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px;">'
            + "".join(pill(t, t == "9:00 pm", h=36) for t in times) + pill("Other time", chevron=True, h=36) + '</div>'
            f'<div style="font-family: {SERIF}; font-size: 22px; padding: 22px 20px 0;">Mon, Sep 28 &#183; 9:00 pm</div>')
    return plan_step("When?", body, back="back")


def picker_row(l, t, n, sub, on):
    return person(l, t, n, sub, cta("Invited" if on else "Invite", "solid" if on else "chip", h=32, size=12.5, grow=False), 40)


def plan_who():
    body = ('<div style="font-size: 14px; color: var(--muted); padding: 8px 20px 0;">You can only invite people who follow you.</div>'
            f'<div style="padding: 14px 16px 6px;">{field("Search&hellip;", icon="search", h=46)}</div>'
            '<div style="padding: 0 20px;">'
            + picker_row("L", 1, "Luc&iacute;a Fern&aacute;ndez", "@lucia &#183; Naco", True) + picker_row("N", 3, "Natalia Cruz", "@nati &#183; Bella Vista", True)
            + picker_row("D", 0, "Diego Read", "@dieguito &#183; Naco", False) + picker_row("I", 4, "Isabela Guerrero", "@isa &#183; Zona Colonial", False) + '</div>')
    return plan_step("With whom?", body, back="back")


def plan_review():
    body = (card('<div style="font-size: 12.5px; font-weight: 650; color: var(--muted);">Voting between</div>'
                 f'<div style="font-family: {SERIF}; font-size: 21px; line-height: 1.3; margin-top: 6px;">1. Lul&uacute; Tasting Bar<br>2. Segundo Muelle</div>'
                 '<div style="font-size: 14px; color: var(--fg2); margin-top: 8px;">Mon, Sep 28 &#183; 9:00 pm</div>'
                 f'<div style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">{stack("LN", 30, "var(--card)")}'
                 '<span style="font-size: 13px; color: var(--muted);">Luc&iacute;a and Natalia</span></div>', "16px", "18px 16px 0")
            + form_label("Note &#183; optional") + f'<div style="padding: 0 16px;">{field("", "Cumple de Luc&iacute;a &mdash; vota antes del jueves.", h=90, multiline=True)}</div>')
    return plan_step("Review your table", body, "Create table", back="back")


def plan_invite():
    inner = ('<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 16px 4px;">' + btn("close", 38, "chip")
             + '<span style="width: 38px;"></span></div>'
             f'<div style="font-family: {SERIF}; font-size: 34px; line-height: 1; padding: 10px 20px 0;">Invite more</div>'
             f'<div style="padding: 14px 16px 6px;">{field("Search&hellip;", icon="search", h=46)}</div><div style="padding: 0 20px;">'
             + picker_row("D", 0, "Diego Read", "@dieguito &#183; Naco", True) + picker_row("C", 5, "Carolina Obj&iacute;o", "@caro &#183; Piantini", True)
             + picker_row("M", 2, "Mateo Bonetti", "@mateo &#183; Piantini", False) + '</div>')
    foot = f'<div style="position: absolute; left: 16px; right: 16px; bottom: 30px; display: flex; z-index: 60;">{cta("Invite 2", "solid")}</div>'
    return plan_detail() + sheet(inner, 110, None) + foot


# ================================================================ EVENTS

def event_bar():
    return ('<div style="position: absolute; left: 16px; right: 16px; bottom: 30px; display: flex; gap: 10px; z-index: 40;">'
            + btn("bookmark", 56, "chip", "Save") + cta("I&rsquo;m going", "accent", h=56) + '</div>')


def event_top():
    e = EVENTS[0]
    hero = ('<div style="position: relative; height: 470px;">' + img(e["p"]) + scrim("to top, rgba(20,4,4,0.9) 0%, rgba(20,4,4,0.2) 55%, rgba(20,4,4,0) 75%") +
            top_nav(None, "back", ["share"], "photo") +
            '<div style="position: absolute; left: 20px; right: 20px; bottom: 22px; color: #f5efe4;">'
            '<div style="display: flex; gap: 6px;">'
            f'<span style="height: 28px; padding: 0 11px; border-radius: 14px; background: var(--cat-food); color: #ffffff; font-size: 12.5px; font-weight: 650; '
            f'display: flex; align-items: center; gap: 5px;">{ic("feed", 13, 2)}Special</span>'
            f'<span style="height: 28px; padding: 0 11px; border-radius: 14px; {PGL} font-size: 12.5px; font-weight: 600; display: flex; align-items: center;">{e["price"]}</span></div>'
            f'<div style="font-family: {SERIF}; font-size: 40px; line-height: 0.98; margin-top: 12px;">Aniversario:<br>Omakase Especial</div>'
            '<div style="font-size: 13.5px; opacity: 0.8; margin-top: 8px;">Samurai &#183; Fri, Oct 2 &#183; 7:00 PM</div></div></div>')
    return (hero + card('<div style="display: flex; align-items: center; gap: 12px;">'
                        f'<span style="color: var(--accent-text); display: flex;">{ic("clock", 22, 2)}</span><div><div style="font-size: 12.5px; color: var(--muted);">Starts</div>'
                        '<div style="font-size: 18px; font-weight: 650; color: var(--accent-text);">In 4 days</div></div>'
                        f'<span style="margin-left: auto;">{stack("DLN", 28, "var(--card)")}</span></div>', "14px 16px", "16px 16px 0")
            + '<div style="font-size: 12.5px; color: var(--muted); text-align: center; padding: 10px 0 0;">Sample event &mdash; not yet confirmed with the venue.</div>'
            + event_bar())


def event_more():
    head = (f'<div style="position: absolute; top: 0; left: 0; right: 0; padding: 58px 16px 10px; {GL} border-width: 0 0 1px 0; z-index: 30; '
            'display: flex; align-items: center; gap: 10px;">' + btn("back", 40, "chip", "Back") +
            f'<span style="flex: 1; font-family: {SERIF}; font-size: 20px; {ELL}">Aniversario: Omakase Especial</span>' + btn("share", 40, "chip") + '</div>')
    lab = lambda t, i: (f'<div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 650; color: var(--muted);">'
                        f'{ic(i, 15, 1.9)}{t}</div>')
    body = ('<div style="height: 120px;"></div>'
            + card(lab("When", "calendar") + '<div style="font-size: 19px; font-weight: 650; margin-top: 8px;">Fri, Oct 2 &#183; 7:00 PM</div>'
                   '<div style="font-size: 14px; color: var(--muted); margin-top: 2px;">until 11:00 PM</div>', "14px 16px")
            + card(lab("Where", "pin") + '<div style="display: flex; align-items: center; gap: 12px; margin-top: 10px;">' + thumb("ceviche", "", 48, 14)
                   + ttext("Samurai", "Japanese &#183; Piantini", None, 20) + f'<span style="color: var(--faint);">{ic("chev_r", 16, 2)}</span></div>'
                   + f'<div style="display: flex; margin-top: 12px;">{cta("Directions", "chip", "nav", 42, size=14)}</div>', "14px 16px", "10px 16px 0")
            + card('<div style="font-size: 16px; line-height: 1.45;">Men&uacute; omakase de edici&oacute;n limitada para celebrar el aniversario del restaurante &mdash; cupos muy limitados.</div>',
                   "14px 16px", "10px 16px 0")
            + card('<div style="display: flex; justify-content: space-between; font-size: 13px;"><span style="font-weight: 650; color: var(--accent-text);">30 spots left</span>'
                   '<span style="color: var(--muted);">0/30</span></div><div style="height: 5px; border-radius: 3px; background: var(--sunk); margin-top: 8px;"></div>',
                   "14px 16px", "10px 16px 0")
            + card(lab("Who&rsquo;s going", "users") + '<div style="font-size: 14.5px; color: var(--muted); margin-top: 8px;">Be the first to go</div>'
                   + f'<div style="display: flex; margin-top: 12px;">{cta("Invite friends", "chip", "send", 42, size=14)}</div>', "14px 16px", "10px 16px 0"))
    return body + head + event_bar()
