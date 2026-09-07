// The shell every page this server renders to a browser shares — the share
// pages (/p/i/:code, /p/u/:handle) and the auth pages (/p/reset-password,
// /p/verify-email). Extracted from routes/share-pages.ts when the second
// consumer arrived; it holds no route logic, only the frame.

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

function ctaHref(): string {
  return webOrigin() ?? '/'
}

// One branded HTML shell — oxblood ground, cream serif, brass accents. Only
// `body` differs per page; `footer` swaps the share pages' "get Mesa" call to
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
    `<a class="cta" href="${esc(ctaHref())}">Ábrelo en Mesa</a>
    <p class="tagline">where your friends actually eat</p>`
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,400&family=Plus+Jakarta+Sans:wght@500;600&display=swap" rel="stylesheet" />
  <style>
    /* FROZEN as Candlelit (oxblood) brand — a public OG/share page seen by
       logged-out strangers inside someone else's feed. Kept dark regardless of
       any app theme so every shared Mesa link previews identically. If this is
       ever themed, add a prefers-color-scheme block HERE in the same commit as
       the app palette (see docs/DESIGN.md "Where color is allowed to live"). */
    :root { --ink:#210104; --cream:#ebe4d6; --cream-dim:#dcccbb; --brass:#c09050; --brass-2:#e2c179; }
    * { box-sizing: border-box; margin: 0; }
    body {
      background: radial-gradient(120% 80% at 50% 0%, #2c1516 0%, var(--ink) 60%);
      color: var(--cream); font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      min-height: 100vh; display: flex; justify-content: center; padding: 32px 20px 48px;
    }
    .wrap { width: 100%; max-width: 460px; text-align: center; }
    .mark { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: 40px; letter-spacing: 1px; color: var(--cream); margin-bottom: 24px; }
    .cover { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 16px; display: block; box-shadow: 0 18px 50px rgba(0,0,0,.5); }
    .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase; color: var(--brass); margin: 22px 0 6px; }
    h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 40px; line-height: 1.05; color: var(--cream); }
    .stat { color: var(--cream-dim); font-size: 14px; margin-top: 10px; }
    ol.list { list-style: none; padding: 0; margin: 24px 0 0; text-align: left; }
    ol.list li { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 16px; padding: 13px 4px; border-bottom: 1px solid rgba(235,228,214,.12); }
    ol.list li:last-child { border-bottom: 0; }
    .pos { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 28px; color: var(--brass); width: 28px; }
    .nm { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: 24px; color: var(--cream); }
    .sc { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: 24px; color: var(--brass-2); }
    blockquote { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 22px; color: var(--cream-dim); margin: 22px auto 0; max-width: 380px; line-height: 1.35; }
    .cta { display: inline-block; margin-top: 34px; background: var(--brass); color: var(--ink); font-weight: 600; font-size: 15px; letter-spacing: .3px; text-decoration: none; padding: 15px 34px; border-radius: 999px; }
    .tagline { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 16px; color: var(--cream-dim); margin-top: 20px; }
    .missing { padding: 60px 0; }

    /* Auth pages (/p/reset-password, /p/verify-email). No JS runs on these —
       script-src is 'none' — so the form posts back to this server and every
       state below is a server-rendered response, not a DOM update. */
    form { margin-top: 26px; text-align: left; }
    label { display: block; font-size: 12px; font-weight: 600; letter-spacing: 1.6px; text-transform: uppercase; color: var(--brass); margin: 18px 0 8px; }
    input[type="password"] {
      width: 100%; padding: 15px 16px; font-size: 16px; font-family: inherit;
      color: var(--cream); background: rgba(235,228,214,.06);
      border: 1px solid rgba(235,228,214,.18); border-radius: 12px;
    }
    input[type="password"]:focus { outline: none; border-color: var(--brass); background: rgba(235,228,214,.09); }
    button {
      width: 100%; margin-top: 26px; padding: 16px 24px; font-family: inherit;
      font-size: 15px; font-weight: 600; letter-spacing: .3px; color: var(--ink);
      background: var(--brass); border: 0; border-radius: 999px; cursor: pointer;
    }
    .hint { font-size: 13px; color: var(--cream-dim); margin-top: 10px; line-height: 1.45; }
    .error { margin-top: 20px; padding: 13px 16px; border-radius: 12px; font-size: 14px; text-align: left; color: #ffd9d2; background: rgba(190,60,45,.18); border: 1px solid rgba(255,120,100,.35); }
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

export const verifyEmailUrl = () => `${publicOrigin()}/p/verify-email`
