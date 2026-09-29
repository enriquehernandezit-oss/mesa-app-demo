"""Welcome (auth + onboarding), settings, and system screens."""
from mesa_ui import (ELL, GL, SERIF, UI, avatar, btn, card, cta, empty, field, group, ic, img, large_title, pill, pills,
                     row, section, switch, thumb, toast, top_nav, ttext)
from screens_a import TOP, compare_card, section_label
from screens_b import chips_wrap, follow_pill, form_label, HOODS, member_profile, person


def mark(size=64, on="night"):
    """Pick 10 B — the M, set in Instrument Serif, cream on the app's original oxblood."""
    r = round(size * 0.2237)
    return (f'<div style="width: {size}px; height: {size}px; border-radius: {r}px; flex-shrink: 0; position: relative; overflow: hidden; '
            'background: radial-gradient(120% 110% at 30% 18%, #4d0b17 0%, #2e0309 42%, #210104 100%); '
            f'box-shadow: inset 0 0 0 1px rgba(241,232,218,0.14), 0 {max(2, size // 16)}px {max(6, size // 5)}px rgba(33,1,4,0.28); '
            'display: flex; align-items: center; justify-content: center;">'
            f'<span style="font-family: {SERIF}; font-size: {round(size * 0.74)}px; line-height: 1; color: #f1e8da; padding-top: {round(size * 0.06)}px;">M</span></div>')


def wordmark(size=40, mark_size=None):
    ms = mark_size or round(size * 1.05)
    return (f'<div style="display: flex; align-items: center; gap: {round(size * 0.3)}px;">{mark(ms)}'
            f'<span style="font-family: {SERIF}; font-size: {size}px; line-height: 1;">Mesa</span></div>')


# ================================================================ WELCOME

def splash():
    return ('<div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;">'
            + mark(104) + f'<span style="font-family: {SERIF}; font-size: 46px; line-height: 1;">Mesa</span></div>')


def auth_top():
    return ('<div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 104px 24px 0;">' + mark(76)
            + f'<div style="font-family: {SERIF}; font-size: 46px; line-height: 1; margin-top: 14px;">Mesa</div>'
            '<div style="font-size: 12.5px; font-weight: 700; letter-spacing: 0.14em; color: var(--muted); margin-top: 14px;">REVOLUCI&Oacute;N GASTRON&Oacute;MICA</div>'
            f'<div style="font-family: {SERIF}; font-size: 21px; margin-top: 4px;">Primer objetivo: SDQ<span style="opacity: 0.5;">_</span></div></div>')


def social_buttons():
    apple = ('<div style="height: 54px; border-radius: 27px; background: var(--fg); color: var(--bg); display: flex; align-items: center; '
             'justify-content: center; font-size: 17px; font-weight: 650;">Continue with Apple</div>')
    google = ('<div style="height: 54px; border-radius: 27px; background: var(--chip); box-shadow: var(--lift); display: flex; align-items: center; '
              'justify-content: center; font-size: 16px; font-weight: 600;">Sign in with Google</div>')
    return ('<div style="display: flex; align-items: center; gap: 12px; padding: 18px 24px 14px; color: var(--muted); font-size: 13px;">'
            '<span style="flex: 1; height: 1px; background: var(--line);"></span>or<span style="flex: 1; height: 1px; background: var(--line);"></span></div>'
            f'<div style="display: flex; flex-direction: column; gap: 10px; padding: 0 20px;">{apple}{google}</div>')


def sign_up():
    return (auth_top() + '<div style="padding: 28px 20px 0; display: flex; flex-direction: column; gap: 10px;">'
            '<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding-left: 4px;">Create your account</div>'
            + field("you@email.com", icon="mail") + field("Password (8+ characters)", icon="lock")
            + '<div style="display: flex; opacity: 0.4;">' + cta("Create account", "solid") + '</div>'
            '<div style="text-align: center; font-size: 14.5px; padding-top: 6px;">Already have an account? <span style="font-weight: 650;">Sign in</span></div></div>'
            + social_buttons())


def sign_in():
    return (auth_top() + '<div style="padding: 28px 20px 0; display: flex; flex-direction: column; gap: 10px;">'
            '<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding-left: 4px;">Welcome back</div>'
            + field("", "enrique@mesa.do", icon="mail") + field("", "&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;", icon="lock")
            + '<div style="display: flex;">' + cta("Sign in", "solid") + '</div>'
            '<div style="text-align: center; font-size: 13.5px; color: var(--danger);">That email or password doesn&rsquo;t match.</div>'
            '<div style="display: flex; justify-content: space-between; font-size: 14px; padding: 2px 4px 0;"><span style="font-weight: 650;">Forgot your password?</span>'
            '<span style="color: var(--muted);">New here? <span style="color: var(--fg); font-weight: 650;">Create one</span></span></div></div>'
            + social_buttons())


def suspended():
    return ('<div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 200px 32px 0;">' + mark(64)
            + '<div style="font-size: 13px; font-weight: 650; color: var(--danger); margin-top: 22px;">Account suspended</div>'
            f'<div style="font-family: {SERIF}; font-size: 32px; line-height: 1.05; margin-top: 8px;">Your account is no longer active.</div>'
            '<div style="font-size: 15px; line-height: 1.45; color: var(--muted); margin-top: 12px;">We suspended this account for breaking community guidelines. '
            'If you think this was a mistake, reply to the email you signed up with.</div></div>'
            f'<div style="position: absolute; left: 20px; right: 20px; bottom: 40px; display: flex;">{cta("Back to start", "chip")}</div>')


def onb_bar(step):
    return ('<div style="padding: 62px 20px 0;"><div style="display: flex; gap: 6px;">'
            + "".join(f'<span style="flex: 1; height: 4px; border-radius: 2px; background: {"var(--fg)" if i < step else "var(--sunk)"};"></span>' for i in range(3))
            + f'</div><div style="font-size: 12.5px; color: var(--muted); margin-top: 9px;">Step {step} of 3 &#183; build your starter list</div></div>')


def onb_title(t, sub):
    return (f'<div style="padding: 18px 20px 0;"><div style="font-family: {SERIF}; font-size: 36px; line-height: 1.02;">{t}</div>'
            f'<div style="font-size: 15px; color: var(--muted); margin-top: 8px; line-height: 1.4;">{sub}</div></div>')


def pinned_cta(text, kind="solid"):
    return (f'<div style="position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 16px 34px; background: linear-gradient(to bottom, rgba(0,0,0,0), var(--bg) 30%); z-index: 40; display: flex;">'
            f'{cta(text, kind)}</div>')


def onboarding_profile():
    bday = ('<div style="display: flex; gap: 8px; padding: 0 16px;">' + "".join(
        f'<div style="flex: {f}; height: 50px; border-radius: 16px; background: var(--card); box-shadow: var(--lift); display: flex; align-items: center; '
        f'padding: 0 14px; font-size: 16px;">{v}</div>' for v, f in [("04", 1), ("03", 1), ("1995", 1.6)]) + '</div>')
    check = ('<div style="display: flex; gap: 12px; padding: 16px 20px 0; align-items: flex-start;">'
             f'<span style="width: 24px; height: 24px; border-radius: 7px; background: var(--solid); color: var(--on-solid); display: flex; align-items: center; '
             f'justify-content: center; flex-shrink: 0;">{ic("check", 14, 2.6)}</span>'
             '<span style="font-size: 13px; line-height: 1.4; color: var(--fg2);">I accept Mesa&rsquo;s <span style="font-weight: 650;">Terms</span> and '
             '<span style="font-weight: 650;">EULA</span>, and understand that inappropriate content and abusive users can be reported, blocked and removed.</span></div>')
    return (onb_bar(1) + onb_title("Who are you at the table?", "This is how your friends find and recognize you on Mesa.")
            + form_label("Name") + f'<div style="padding: 0 16px;">{field("Your name", "Enrique Hern&aacute;ndez")}</div>'
            + form_label("@username &#183; optional") + f'<div style="padding: 0 16px;">{field("@yourusername", "@enriquehdz")}</div>'
            + form_label("Neighborhood") + chips_wrap(HOODS, ("Piantini",), 32)
            + form_label("Birthday &#183; private, never on your profile") + bday + check + pinned_cta("Continue"))


def onboarding_pick():
    def c(p, n, meta, on=False):
        chk = (f'<span style="position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: var(--solid); color: var(--on-solid); '
               f'display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--bg);">{ic("check", 15, 2.6)}</span>') if on else ""
        ring = "box-shadow: 0 0 0 2.5px var(--fg);" if on else "box-shadow: var(--lift);"
        return (f'<div style="border-radius: 22px; background: var(--card); overflow: hidden; {ring}">'
                f'<div style="height: 104px; position: relative;">{img(p)}{chk}</div>'
                f'<div style="padding: 9px 12px 11px;"><div style="font-family: {SERIF}; font-size: 18px; line-height: 1.05; {ELL}">{n}</div>'
                f'<div style="font-size: 12px; color: var(--muted); margin-top: 2px; {ELL}">{meta}</div></div></div>')
    grid = [("branzino", "O.Livia", "Mediterranean &#183; Piantini", True), ("ceviche", "Segundo Muelle", "Peruvian &#183; Naco", True),
            ("tapas", "Lul&uacute; Tasting Bar", "Tapas &#183; Zona Colonial", False), ("steak", "El Mes&oacute;n de la Cava", "Steakhouse &#183; Serrall&eacute;s", True),
            ("bar", "Vesuvio Sarasota", "Italian &#183; Bella Vista", False), ("mofongo", "Adrian Tropical", "Dominican &#183; Bella Vista", True)]
    return (onb_bar(2) + onb_title("Which of these have you been to?", "Pick 3&ndash;8. You&rsquo;ll put them in order next.")
            + '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 18px 16px 0;">'
            + "".join(c(*g) for g in grid) + '</div>' + pinned_cta("Rank these 4"))


def onboarding_compare():
    return (onb_bar(2) + '<div style="text-align: center; padding: 18px 20px 14px;"><div style="font-size: 13px; font-weight: 600; color: var(--muted);">1 of 4</div>'
            f'<div style="font-family: {SERIF}; font-size: 34px; line-height: 1; margin-top: 6px;">Which was better?</div></div>'
            + compare_card("branzino", "O.Livia", "Mediterranean &#183; Piantini &#183; $$$$", "Piantini")
            + f'<div style="display: flex; justify-content: center; padding: 10px 0;">{cta("About the same", "chip", h=40, size=14, grow=False)}</div>'
            + compare_card("ceviche", "Segundo Muelle", "Peruvian &#183; Naco &#183; $$$", "Naco")
            + '<div style="text-align: center; font-size: 13px; font-weight: 600; color: var(--muted); padding: 14px 0;">Haven&rsquo;t been to one? Swap it</div>')


def onboarding_friends():
    return (onb_bar(3) + onb_title("Follow a few friends", "Their rankings fill your feed. That&rsquo;s the whole point of Mesa.")
            + f'<div style="display: flex; padding: 16px 16px 0;">{cta("Find friends in your contacts", "chip", "users", 48, size=15)}</div>'
            + '<div style="font-size: 13px; color: var(--muted); padding: 10px 20px 4px;">6 contacts are on Mesa.</div>'
            + group([person("D", 0, "Diego Read", "@dieguito &#183; Naco", follow_pill(True)), person("L", 1, "Luc&iacute;a Fern&aacute;ndez", "@lucia &#183; Naco", follow_pill(True)),
                     person("N", 3, "Natalia Cruz", "@nati &#183; Bella Vista", follow_pill(True)), person("V", 2, "Valentina P&eacute;rez", "@valen &#183; Bella Vista", follow_pill()),
                     person("R", 5, "Rafael Then", "@rafa &#183; Serrall&eacute;s", follow_pill())], "8px 16px 0")
            + pinned_cta("Done &mdash; following 3"))


def verify_email():
    return ('<div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 210px 32px 0;">' + mark(64)
            + '<div style="font-size: 13px; font-weight: 650; color: var(--muted); margin-top: 22px;">Email confirmed</div>'
            f'<div style="font-family: {SERIF}; font-size: 34px; line-height: 1.05; margin-top: 8px;">You&rsquo;re all set.<br>Your email is confirmed.</div>'
            '<div style="font-size: 15px; line-height: 1.45; color: var(--muted); margin-top: 12px;">You can now rank, write notes, and add dishes.</div></div>'
            f'<div style="position: absolute; left: 20px; right: 20px; bottom: 40px; display: flex;">{cta("Enter Mesa", "solid")}</div>')


def reset_password():
    return ('<div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 150px 32px 0;">' + mark(56)
            + '<div style="font-size: 13px; font-weight: 650; color: var(--muted); margin-top: 18px;">Reset password</div>'
            f'<div style="font-family: {SERIF}; font-size: 32px; line-height: 1.05; margin-top: 6px;">Choose a new password</div></div>'
            '<div style="padding: 26px 20px 0; display: flex; flex-direction: column; gap: 10px;">'
            + field("", "&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;", icon="lock") + field("", "&bull;&bull;&bull;&bull;&bull;&bull;", icon="lock")
            + '<div style="font-size: 13.5px; color: var(--danger); padding-left: 4px;">Passwords don&rsquo;t match.</div>'
            + '<div style="display: flex; opacity: 0.4;">' + cta("Save new password", "solid") + '</div></div>')


# ================================================================ SETTINGS

def settings():
    me = card('<div style="display: flex; align-items: center; gap: 12px;">' + avatar("E", 48, 0)
              + ttext("Enrique Hern&aacute;ndez", "@enriquehdz &#183; 160 ranked", None, 21)
              + '<span style="font-size: 14px; font-weight: 650;">Edit</span></div>', "14px 16px")
    return (top_nav() + large_title("Settings", top=112) + '<div style="height: 16px;"></div>' + me + '<div style="height: 14px;"></div>'
            + group([row(t, None, i) for t, i in [("Your account", "profile"), ("Privacy", "lock"), ("Preferences", "sun"),
                                                   ("Notifications", "bell"), ("About", "info")]])
            + '<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding: 20px 20px 8px;">Friends</div>'
            + group([row("Find friends", None, "users"), row("Invite friends", None, "send")])
            + '<div style="height: 14px;"></div>' + group([row("Sign out", None, None, False)]))


def account():
    danger = ('<div style="margin: 16px 16px 0; padding: 16px; border-radius: 22px; box-shadow: inset 0 0 0 1.5px var(--danger);">'
              '<div style="font-size: 13px; font-weight: 700; color: var(--danger);">Danger zone</div>'
              '<div style="font-size: 14px; line-height: 1.45; color: var(--fg2); margin-top: 6px;">Deleting your account permanently erases your rankings, notes, '
              'follows and profile. This can&rsquo;t be undone.</div>'
              '<div style="margin-top: 12px; height: 44px; border-radius: 22px; box-shadow: inset 0 0 0 1.5px var(--danger); color: var(--danger); display: flex; '
              'align-items: center; justify-content: center; font-size: 15px; font-weight: 650;">Delete account</div></div>')
    verified = f'<span style="display: flex; align-items: center; gap: 4px; font-size: 14px; color: var(--muted);">Verified{ic("check", 14, 2.2)}</span>'
    return (top_nav("Your account") + '<div style="height: 118px;"></div>'
            + group([row("enrique@mesa.do", None, "mail", False, verified), row("Birthday", "March 4, 1995", "calendar"),
                     row("Change password", None, "lock"), row("Sign out on other devices", None, "refresh", False)]) + danger)


def privacy():
    return (top_nav("Privacy") + '<div style="height: 118px;"></div>'
            + group([row("Friends-only scores", None, None, False, switch(False), "Only people you follow back see your scores."),
                     row("Blocked accounts", None, None), row("Export my rankings", None, None)]))


def blocked():
    unb = '<span style="font-size: 15px; font-weight: 650;">Unblock</span>'
    return (top_nav("Blocked accounts") + '<div style="height: 118px;"></div>'
            + group([person("J", 3, "Juan P.", "@juanp", unb, 36), person("S", 1, "Someone", None, unb, 36)]))


def theme_tile(name, sub, day, active=False):
    """ThemePicker swatches are literal previews of each theme (docs/DESIGN.md allows raw color here)."""
    bg, fg, card_ = ("#f3ede4", "#16110f", "#ffffff") if day == "day" else ("#0b0809", "#f4ede2", "#171213")
    prev = (f'<div style="height: 96px; border-radius: 16px; background: {bg}; position: relative; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(120,80,60,0.18);">'
            f'<div style="position: absolute; left: 10px; top: 12px; width: 50px; height: 7px; border-radius: 4px; background: {fg}; opacity: 0.85;"></div>'
            f'<div style="position: absolute; left: 10px; right: 10px; top: 28px; height: 26px; border-radius: 9px; background: {card_};"></div>'
            f'<div style="position: absolute; left: 10px; right: 10px; bottom: 10px; height: 18px; border-radius: 9px; background: {fg}; opacity: 0.9;"></div></div>')
    if day == "auto":
        prev = ('<div style="height: 96px; border-radius: 16px; overflow: hidden; display: flex; box-shadow: inset 0 0 0 1px rgba(120,80,60,0.18);">'
                '<div style="flex: 1; background: #f3ede4;"></div><div style="flex: 1; background: #0b0809;"></div></div>')
    ring = "box-shadow: 0 0 0 2.5px var(--fg);" if active else "box-shadow: var(--lift);"
    return (f'<div style="flex: 1; border-radius: 22px; background: var(--card); padding: 8px 8px 10px; {ring}">{prev}'
            f'<div style="font-size: 14.5px; font-weight: 650; margin-top: 9px; padding-left: 4px;">{name}</div>'
            f'<div style="font-size: 12px; color: var(--muted); padding-left: 4px;">{sub}</div></div>')


def preferences(active="Auto"):
    return (top_nav("Preferences") + '<div style="height: 118px;"></div>'
            + '<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding: 0 20px 10px;">Appearance</div>'
            + '<div style="display: flex; gap: 8px; padding: 0 16px;">' + theme_tile("Auto", "Follows the evening", "auto", active == "Auto")
            + theme_tile("Afternoon", "Cream", "day", active == "Afternoon") + theme_tile("Candlelit", "Black", "night", active == "Candlelit") + '</div>'
            + '<div style="font-size: 13px; color: var(--muted); padding: 10px 20px 0; line-height: 1.4;">Auto switches to Candlelit after dark, or when your iPhone is in dark mode.</div>'
            + '<div style="font-size: 13px; font-weight: 600; color: var(--muted); padding: 24px 20px 10px;">Language</div>'
            + pills(["English", "Espa&ntilde;ol"], 0))


def notifications():
    perm = card('<div style="font-size: 15px; line-height: 1.4;">Turn on notifications so you don&rsquo;t miss anything.</div>'
                f'<div style="display: flex; margin-top: 12px;">{cta("Enable notifications", "solid", "bell", 44, size=14.5)}</div>', "16px")
    rows = [row(t, None, None, False, switch(True)) for t in ["Follows and cheers", "Plans", "Friends&rsquo; activity", "Your dishes", "Events you RSVP to"]]
    return (top_nav("Notifications") + '<div style="height: 118px;"></div>' + perm + '<div style="height: 12px;"></div>' + group(rows)
            + '<div style="font-size: 13px; color: var(--muted); padding: 10px 20px 0; line-height: 1.4;">You can turn off any category any time &mdash; this doesn&rsquo;t '
            'affect whether you get system notifications, only which.</div>')


def about():
    return (top_nav("About") + '<div style="height: 118px;"></div>'
            + '<div style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 6px 0 22px;">' + mark(72)
            + '<div style="font-size: 13px; color: var(--muted);">Mesa 1.0.0</div></div>'
            + group([row("Privacy Policy"), row("Terms"), row("EULA"), row("App version", "1.0.0", None, False)]))


def legal():
    sec = lambda h, p: (f'<div style="padding: 18px 20px 0;"><div style="font-size: 17px; font-weight: 650;">{h}</div>'
                        f'<div style="font-size: 15px; line-height: 1.55; color: var(--fg2); margin-top: 6px;">{p}</div></div>')
    return (top_nav() + large_title("Pol&iacute;tica de Privacidad", "&Uacute;ltima actualizaci&oacute;n: 21 de septiembre de 2026", top=112, size=34)
            + '<div style="margin: 14px 16px 0; padding: 12px 14px; border-radius: 16px; background: var(--accent-soft); font-size: 13.5px; color: var(--fg2); line-height: 1.4;">'
            'Available in Spanish for now &mdash; the legal text hasn&rsquo;t been translated yet.</div>'
            + sec("1. Qui&eacute;nes somos", "Mesa es una aplicaci&oacute;n para descubrir restaurantes en Santo Domingo a trav&eacute;s de los rankings de tus amigos.")
            + sec("2. Qu&eacute; datos recopilamos", "Tu nombre, correo, barrio, fecha de nacimiento, tus rankings y notas, y las fotos que decides subir. "
                  "Tu fecha de nacimiento nunca aparece en tu perfil.")
            + sec("3. C&oacute;mo los usamos", "Para mostrar tus rankings a las personas que te siguen y para recomendarte lugares. No vendemos tus datos."))


def moderation():
    def rep(kind, when, body, reason, act="Remove"):
        return card(f'<div style="display: flex; justify-content: space-between; font-size: 12.5px;"><span style="font-weight: 700;">{kind}</span>'
                    f'<span style="color: var(--muted);">{when}</span></div>{body}'
                    f'<div style="font-size: 12.5px; color: var(--muted); margin-top: 8px;">Reason: {reason}</div>'
                    '<div style="display: flex; gap: 8px; margin-top: 12px;">'
                    f'<span style="flex: 1; height: 38px; border-radius: 19px; box-shadow: inset 0 0 0 1.5px var(--danger); color: var(--danger); display: flex; '
                    f'align-items: center; justify-content: center; font-size: 14px; font-weight: 650;">{act}</span>' + cta("Dismiss", "chip", h=38, size=14) + '</div>',
                    "14px 16px", "0 16px 10px")
    return (top_nav() + large_title("Moderation", "3 open reports", top=112) + '<div style="height: 16px;"></div>'
            + rep("Note", "3h", f'<div style="font-family: {SERIF}; font-size: 19px; margin-top: 8px;">&ldquo;Pésimo servicio, nunca vayan.&rdquo;</div>', "Harassment")
            + rep("Dish", "1d", '<div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">' + thumb("pizza", "", 48, 14)
                  + ttext("Pizza", "by @someone", None, 18) + '</div>', "Inappropriate")
            + rep("Member", "2d", f'<div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">{avatar("X", 36, 3)}'
                  + ttext("Spam Account", "@promo_sdq", None, 18) + '</div>', "Spam", "Eject"))


def photo_edit():
    grid = "".join(f'<span style="position: absolute; {s}: {p}%; {"top: 0; bottom: 0; width: 1px" if s == "left" else "left: 0; right: 0; height: 1px"}; '
                   'background: rgba(255,255,255,0.35);"></span>' for s in ("left", "top") for p in (33.3, 66.6))
    return ('<div style="display: flex; align-items: center; justify-content: space-between; padding: 58px 16px 0;">' + btn("close", 40, "chip", "Close")
            + '<span style="font-size: 17px; font-weight: 650;">Edit photo</span><span style="width: 40px;"></span></div>'
            '<div style="margin: 60px 16px 0; height: 361px; border-radius: 18px; background: var(--sunk); position: relative; overflow: hidden;">'
            f'<div style="position: absolute; inset: 0;">{img("pizza")}</div>{grid}</div>'
            '<div style="text-align: center; font-size: 13.5px; color: var(--muted); padding-top: 14px;">Pinch and drag to frame the photo</div>'
            '<div style="position: absolute; left: 16px; right: 16px; bottom: 34px; display: flex; gap: 10px;">'
            + '<span style="width: 56px; height: 56px; border-radius: 28px; background: var(--chip); box-shadow: var(--lift); display: flex; align-items: center; '
            f'justify-content: center;">{ic("refresh", 22, 1.9)}</span>' + cta("Use photo", "solid", h=56) + '</div>')


def reported_toast():
    return member_profile() + toast("Reported. Thanks &mdash; we&rsquo;ll take a look.", 40)


# ================================================================ SHARE CARD (frozen black + burgundy — it leaves the app)

def share_card(kind="spot"):
    """1080x1920 story drawn at 1/4 scale. Theme-invariant colors on purpose (docs/DESIGN.md: the share card)."""
    cream, muted = "#f1e8da", "rgba(241,232,218,0.6)"
    top = ('<div style="position: absolute; left: 0; right: 0; top: 0; height: 300px;">' + img("steak" if kind == "spot" else "pasta") + '</div>'
           '<div style="position: absolute; left: 0; right: 0; top: 150px; height: 160px; background: linear-gradient(to bottom, rgba(11,8,9,0), #0b0809);"></div>'
           f'<div style="position: absolute; top: 18px; left: 0; right: 0; display: flex; justify-content: center;">'
           f'<div style="display: flex; align-items: center; gap: 7px;">{mark(24)}<span style="font-family: {SERIF}; font-size: 22px; color: {cream};">Mesa</span></div></div>')
    if kind == "spot":
        body = (f'<div style="position: absolute; left: 22px; right: 22px; top: 222px; color: {cream};">'
                f'<div style="font-family: {SERIF}; font-size: 50px; line-height: 1;">#1</div>'
                f'<div style="font-family: {SERIF}; font-size: 32px; line-height: 1; margin-top: 6px;">El Mes&oacute;n de la Cava</div>'
                f'<div style="font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: {muted}; margin-top: 8px;">STEAKHOUSE &#183; SERRALL&Eacute;S</div>'
                f'<div style="display: flex; align-items: baseline; gap: 8px; margin-top: 14px;"><span style="font-family: {SERIF}; font-size: 40px; line-height: 1;">9.6</span>'
                '<span style="font-size: 12px; font-weight: 700; color: #f4ede2; background: #7a1a29; padding: 3px 8px; border-radius: 9px;">Must go</span></div>'
                f'<div style="font-family: {SERIF}; font-size: 17px; line-height: 1.2; margin-top: 12px;">&ldquo;Mi spot de siempre. Pide el cordero.&rdquo;</div></div>')
    else:
        rows = [("1", "La Locanda", "8.2"), ("2", "Vesuvio Sarasota", "8.8"), ("3", "Casa Luca", "9.2"), ("4", "Pizzarelli", "7.7")]
        body = (f'<div style="position: absolute; left: 22px; right: 22px; top: 250px; color: {cream};">'
                f'<div style="font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: {muted};">PASTA NIGHT &#183; 6 SAVED</div>'
                + "".join(f'<div style="display: flex; align-items: baseline; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(241,232,218,0.12);">'
                          f'<span style="font-family: {SERIF}; font-size: 20px; width: 16px; color: {muted};">{n}</span>'
                          f'<span style="flex: 1; font-family: {SERIF}; font-size: 21px;">{name}</span><span style="font-family: {SERIF}; font-size: 20px;">{s}</span></div>'
                          for n, name, s in rows) + '</div>')
    foot = (f'<div style="position: absolute; left: 0; right: 0; bottom: 18px; text-align: center; font-family: {SERIF}; font-size: 15px; color: {muted};">'
            'donde tus amigos comen de verdad</div>')
    return (f'<div style="width: 270px; height: 480px; border-radius: 22px; overflow: hidden; position: relative; background: #0b0809; flex-shrink: 0; '
            f'font-family: {UI}; box-shadow: 0 20px 50px rgba(33,1,4,0.3);">{top}{body}{foot}</div>')
