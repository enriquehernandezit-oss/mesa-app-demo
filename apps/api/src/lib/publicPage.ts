// The shell every page this server renders to a browser shares — the share
// pages (/p/i/:code, /p/u/:handle) and the auth pages (/p/reset-password,
// /p/verify-email). Extracted from routes/share-pages.ts when the second
// consumer arrived; it holds no route logic, only the frame.

import { reportPageHref } from './support'

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Where "get Mesa" sends someone who taps a share link on the web. With the web
// app retired this is the marketing/App Store landing page — set PUBLIC_WEB_URL
// to it. Falls back gracefully so nothing breaks unconfigured.
export function webOrigin(): string | null {
  return process.env.PUBLIC_WEB_URL ?? process.env.APP_ORIGINS?.split(',')[0] ?? null
}

// THIS server's own public origin. Auth emails link to pages served here (the
// web app that used to host them is retired), so getting this wrong means a
// dead password-reset link — the reason for the layered fallback rather than a
// single required var. BETTER_AUTH_URL is already this origin wherever Better
// Auth is correctly configured, which makes the common deployment work unset.
export function publicOrigin(): string {
  return (
    process.env.PUBLIC_API_URL ??
    process.env.BETTER_AUTH_URL ??
    (process.env.APP_ORIGINS ?? 'http://localhost:3000').split(',')[0] ??
    'http://localhost:3000'
  )
}

// Where the call to action points. With a landing page configured, there. Without one the old
// fallback was "/" — the API root, a JSON 404 — so the button went nowhere. A person who has the
// app is better served by opening it on this very page (the mesa:// form of the path, which
// lib/deepLinks.ts in the app already understands), and the button is only an offer: iOS ignores it
// when the app is not installed. Production should set PUBLIC_WEB_URL to the landing/App Store page
// (a boot warning in index.ts says so).
export function ctaHref(canonical: string): string {
  const web = webOrigin()
  if (web) return web
  try {
    const u = new URL(canonical)
    return `mesa://${u.pathname.replace(/^\/+/, '')}${u.search}`
  } catch {
    return 'mesa://'
  }
}

// A score is a NUMBER + a WORD, same as in the app (apps/mobile/src/lib/score.ts — keep the
// thresholds in step): 9+ Must go, 8+ Great, 7+ Good, 5+ Fine, else Skip. Stored 0–100, shown
// 0–10 with one decimal; the word is read off the number as DISPLAYED, so "9.0" is never "Great".
// These pages are Spanish, so the words are the app's Spanish ones.
export function displayScore(score: number): string {
  return (score / 10).toFixed(1)
}

export function scoreWord(score: number): string {
  const shown = Number(displayScore(score))
  if (shown >= 9) return 'Imperdible'
  if (shown >= 8) return 'Excelente'
  if (shown >= 7) return 'Bueno'
  if (shown >= 5) return 'Normal'
  return 'Sáltalo'
}

// The figure in the serif with its word beside it as a burgundy pill — the row-end of every
// ranked list on these pages.
export function scoreChip(score: number): string {
  return `<span class="sc"><span class="sn">${displayScore(score)}</span><span class="sw">${esc(scoreWord(score))}</span></span>`
}

// One branded HTML shell — black ground with a breath of burgundy, cream type, a burgundy call to
// action. Only `body` differs per page; `footer` swaps the share pages' "get Mesa" call to
// action for something else (the auth pages send you back to the app instead).
export function layout(opts: {
  title: string
  description: string
  image: string | null
  canonical: string
  body: string
  footer?: string
}): string {
  const { title, description, image, canonical, body, footer } = opts
  const imgTags = image
    ? `<meta property="og:image" content="${esc(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${esc(image)}" />`
    : '<meta name="twitter:card" content="summary" />'
  const foot =
    footer ??
    `<a class="cta" href="${esc(ctaHref(canonical))}">Ábrelo en Mesa</a>
    <p class="tagline">where your friends actually eat</p>
    <p class="fine"><a href="${esc(reportPageHref(canonical))}">Reportar esta página</a> · <a href="/legal/privacy">Privacidad</a> · <a href="/legal/terms">Términos</a></p>`
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Mesa" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  ${imgTags}
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap" rel="stylesheet" />
  <style>
    /* FROZEN as Mesa's black + burgundy + cream — a public OG/share page seen by logged-out
       strangers inside someone else's feed, so it stays dark regardless of any app theme and every
       shared Mesa link previews identically. Same palette as the app's share card
       (apps/mobile/src/components/ShareCard.tsx). Display type is Instrument Serif (upright — the
       face has no slanted style, and none is used anywhere); UI type is the system font. If this is ever
       themed, add a prefers-color-scheme block HERE in the same commit as the app palette (see
       docs/DESIGN.md "Where color is allowed to live"). */
    :root { --bg:#0b0809; --glow:#2a0c13; --card:#171213; --cream:#f4ede2; --cream-dim:rgba(244,237,226,.62); --line:rgba(244,237,226,.12); --burgundy:#7a1a29; --danger:#ff6b5e; }
    * { box-sizing: border-box; margin: 0; }
    body {
      background: radial-gradient(120% 70% at 50% 0%, var(--glow) 0%, var(--bg) 62%);
      background-color: var(--bg);
      color: var(--cream); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, 'Segoe UI', sans-serif;
      min-height: 100vh; display: flex; justify-content: center; padding: 32px 20px 48px;
    }
    .wrap { width: 100%; max-width: 460px; text-align: center; }
    .mark { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-style: normal; font-size: 46px; line-height: 1; color: var(--cream); margin-bottom: 26px; }
    .cover { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 24px; display: block; box-shadow: 0 18px 50px rgba(0,0,0,.5); }
    .eyebrow { font-size: 13px; font-weight: 600; color: var(--cream-dim); margin: 22px 0 8px; }
    h1 { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-style: normal; font-size: 44px; line-height: 1.02; color: var(--cream); }
    .stat { color: var(--cream-dim); font-size: 15px; margin-top: 12px; }
    ol.list { list-style: none; padding: 0; margin: 24px 0 0; text-align: left; }
    ol.list li { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 16px; padding: 13px 4px; border-bottom: 1px solid var(--line); }
    ol.list li:last-child { border-bottom: 0; }
    /* A list with no per-item score (collections, dish lists, curated lists —
       none of them carry a score at the list level the way a ranking does):
       same rows, two columns instead of three. */
    ol.list.list--noscore li { grid-template-columns: auto 1fr; }
    .pos { font-family: 'Instrument Serif', Georgia, serif; font-size: 30px; color: var(--cream-dim); width: 30px; }
    .nm { font-family: 'Instrument Serif', Georgia, serif; font-size: 26px; line-height: 1.1; color: var(--cream); }
    /* A score: the figure in the serif, its word beside it as a burgundy pill. */
    .sc { display: inline-flex; align-items: baseline; gap: 8px; white-space: nowrap; }
    .sn { font-family: 'Instrument Serif', Georgia, serif; font-size: 26px; color: var(--cream); font-variant-numeric: tabular-nums; }
    .sw { font-size: 12px; font-weight: 600; color: var(--cream); background: var(--burgundy); padding: 3px 9px; border-radius: 10px; }
    blockquote { font-family: 'Instrument Serif', Georgia, serif; font-style: normal; font-size: 24px; color: var(--cream-dim); margin: 22px auto 0; max-width: 380px; line-height: 1.25; }
    .cta { display: inline-block; margin-top: 34px; background: var(--burgundy); color: var(--cream); font-weight: 600; font-size: 16px; text-decoration: none; padding: 16px 36px; border-radius: 999px; }
    .tagline { font-family: 'Instrument Serif', Georgia, serif; font-style: normal; font-size: 18px; color: var(--cream-dim); margin-top: 20px; }
    .missing { padding: 60px 0; }
    .fine { margin-top: 26px; font-size: 13px; color: var(--cream-dim); }
    .fine a { color: var(--cream-dim); text-underline-offset: 3px; }
    .copy { color: var(--cream-dim); font-size: 16px; line-height: 1.5; margin: 18px auto 0; max-width: 380px; text-align: left; }
    .copy a { color: var(--cream); }
    h2 { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-style: normal; font-size: 28px; color: var(--cream); margin-top: 30px; text-align: left; }

    /* Auth pages (/p/reset-password, /p/verify-email). No JS runs on these —
       script-src is 'none' — so the form posts back to this server and every
       state below is a server-rendered response, not a DOM update. */
    form { margin-top: 26px; text-align: left; }
    label { display: block; font-size: 13px; font-weight: 600; color: var(--cream-dim); margin: 18px 0 8px; }
    input[type="password"] {
      width: 100%; padding: 15px 18px; font-size: 16px; font-family: inherit;
      color: var(--cream); background: var(--card);
      border: 1px solid var(--line); border-radius: 18px;
    }
    input[type="password"]:focus { outline: none; border-color: var(--cream-dim); }
    button {
      width: 100%; margin-top: 26px; padding: 17px 24px; font-family: inherit;
      font-size: 16px; font-weight: 600; color: var(--cream);
      background: var(--burgundy); border: 0; border-radius: 999px; cursor: pointer;
    }
    .hint { font-size: 14px; color: var(--cream-dim); margin-top: 10px; line-height: 1.45; }
    .error { margin-top: 20px; padding: 13px 16px; border-radius: 16px; font-size: 14px; text-align: left; color: var(--danger); background: rgba(255,107,94,.1); border: 1px solid rgba(255,107,94,.35); }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="mark">mesa</div>
    ${body}
    ${foot}
  </main>
</body>
</html>`
}

export function notFound(canonical: string): string {
  return layout({
    title: 'Mesa',
    description: 'Where your friends actually eat — Santo Domingo.',
    image: null,
    canonical,
    body: '<div class="missing"><h1>No encontrado</h1><p class="stat">Este enlace ya no existe.</p></div>',
  })
}

// The emailed links and the routes that serve them (routes/auth-pages.ts) live
// one import apart so they can't drift. They're here rather than in that file
// because auth.ts needs them and auth-pages.ts imports auth — the other
// direction would be a cycle.
export const resetPasswordUrl = (token: string) =>
  `${publicOrigin()}/p/reset-password?token=${encodeURIComponent(token)}`
