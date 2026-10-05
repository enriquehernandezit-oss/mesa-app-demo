import { Hono } from 'hono'

import type { AppEnv } from '../context'
import { LEGAL_DOCS, type LegalDoc, type LegalDocId } from '../lib/legalCopy'
import { esc } from '../lib/publicPage'

// PUBLIC legal pages. App Store Connect asks for a Privacy Policy URL and a
// Terms URL that a reviewer can open in a browser with no account — the app's
// own screens (apps/mobile/src/app/legal/[doc].tsx) satisfy 5.1's "reachable
// in-app" half, these satisfy the hosted half. Same text, one source
// (lib/legalCopy.ts).
//
// Mounted at /legal BEFORE the session middleware, like the share and auth
// pages: no cookie is read, nothing here is behind requireAuth, and a crawler
// or an App Store reviewer gets the document on the first request.
//
// These pages ship ZERO javascript and make ZERO external requests — no web
// fonts, no analytics, no images. That is a promise to whoever opens a privacy
// policy, and it is enforced by the /legal CSP in index.ts. Keep it.

// The one place outside the app's token layer where Mesa's colors are written
// literally — a separate workspace package with no access to
// apps/mobile/src/theme/vars.ts, exactly like lib/publicPage.ts's shell (see
// docs/DESIGN.md, "Where color is allowed to live"). Unlike that one, this
// page follows the reader's device: Day (cream, white card) by default, Night
// (black, the night card) under prefers-color-scheme — a share card is an
// artifact that leaves the app and wants to look like a Mesa object inside a
// stranger's feed, while a legal document just wants to be read. Values copied
// from the `day` and `night` maps in vars.ts.
//
// Fonts are the system stacks rather than Instrument Serif / SF via Google
// Fonts, because loading those means a request to Google's servers from a page
// whose whole point is that it doesn't phone anywhere. Georgia stands in for
// the serif; nothing on the page is italic.
const STYLES = `
  :root {
    color-scheme: light dark;
    --bg: #f3ede4; --surface: #ffffff; --logo: #210104;
    --text: #16110f; --text-2: #3d332d; --text-muted: #8a7a6c;
    --accent: #7a1a29; --line: rgba(22, 17, 15, 0.09);
    --lift: 0 1px 2px rgba(60, 40, 20, 0.05), 0 10px 28px rgba(60, 40, 20, 0.07);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b0809; --surface: #171213; --logo: #f4ede2;
      --text: #f4ede2; --text-2: #d9cfc2; --text-muted: rgba(244, 237, 226, 0.55);
      --accent: #f4ede2; --line: rgba(255, 255, 255, 0.08);
      --lift: none;
    }
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--bg); color: var(--text-2);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, 'Segoe UI', sans-serif;
    font-size: 16px; line-height: 1.6;
    padding: 40px 20px 64px;
  }
  .wrap { width: 100%; max-width: 640px; margin: 0 auto; }
  .mark {
    font-family: Georgia, 'Times New Roman', serif; font-style: normal; font-size: 36px;
    color: var(--logo); text-decoration: none;
  }
  .doc { margin-top: 28px; background: var(--surface); border-radius: 24px; padding: 32px 28px; box-shadow: var(--lift); }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-style: normal; font-weight: 400; font-size: 38px; line-height: 1.08; color: var(--text); }
  h2 { font-size: 18px; font-weight: 650; color: var(--text); margin: 30px 0 8px; }
  p { margin-top: 12px; }
  p:first-of-type { margin-top: 0; }
  .updated { font-size: 14px; color: var(--text-muted); margin-top: 10px; }
  ul { margin: 14px 0 0; padding-left: 20px; }
  li { margin-top: 8px; }
  a { color: var(--accent); }
  .foot { margin-top: 24px; font-size: 14px; color: var(--text-muted); }
  .foot a { margin-right: 14px; }
  @media (max-width: 480px) {
    body { padding: 28px 16px 48px; }
    .doc { padding: 24px 20px; border-radius: 20px; }
    h1 { font-size: 30px; }
  }
`

// `nav` is the row of links to the other two documents — useful at the foot of
// a document, redundant on the index, which IS that list.
function page(opts: { title: string; description: string; body: string; nav?: boolean }): string {
  const nav =
    opts.nav === false
      ? ''
      : `<p class="foot">
      <a href="/legal/privacy">Privacidad</a>
      <a href="/legal/terms">Términos</a>
      <a href="/legal/eula">Licencia</a>
    </p>`
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.title)}</title>
  <meta name="description" content="${esc(opts.description)}" />
  <meta name="robots" content="index, follow" />
  <style>${STYLES}</style>
</head>
<body>
  <main class="wrap">
    <a class="mark" href="/legal">mesa</a>
    <div class="doc">
      ${opts.body}
    </div>
    ${nav}
  </main>
</body>
</html>`
}

function docPage(doc: LegalDoc): string {
  const sections = doc.sections
    .map(
      (s) =>
        `<h2>${esc(s.heading)}</h2>\n      ${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n      ')}`,
    )
    .join('\n      ')
  return page({
    title: `${doc.title} — Mesa`,
    // The first paragraph doubles as the meta description: it is already the
    // one-sentence version of the document.
    description: doc.sections[0]?.paragraphs[0] ?? 'Mesa — Santo Domingo.',
    body: `<h1>${esc(doc.title)}</h1>
      <p class="updated">${esc(doc.updated)}</p>
      ${sections}`,
  })
}

export const legalPagesRoutes = new Hono<AppEnv>()

  // The index App Store Connect / a curious reader lands on.
  .get('/', (c) => {
    c.header('Cache-Control', 'public, max-age=3600')
    const links = (Object.keys(LEGAL_DOCS) as LegalDocId[])
      .map((id) => `<li><a href="/legal/${id}">${esc(LEGAL_DOCS[id].title)}</a></li>`)
      .join('\n        ')
    return c.html(
      page({
        title: 'Legal — Mesa',
        description: 'Política de privacidad, términos de servicio y acuerdo de licencia de Mesa.',
        nav: false,
        body: `<h1>Legal</h1>
      <p class="updated">Los tres documentos de Mesa, en español.</p>
      <ul>
        ${links}
      </ul>`,
      }),
    )
  })

  .get('/:doc', (c) => {
    // Widened to a string index so an unknown slug is `undefined` rather than a
    // cast the compiler has to be talked into.
    const byId: Record<string, LegalDoc> = LEGAL_DOCS
    // hasOwn: a plain object also answers to "constructor" and "toString", which would throw below.
    const slug = c.req.param('doc')
    const doc = Object.hasOwn(byId, slug) ? byId[slug] : undefined
    if (!doc) {
      return c.html(
        page({
          title: 'No encontrado — Mesa',
          description: 'Mesa — Santo Domingo.',
          body: '<h1>No encontrado</h1><p>Ese documento no existe.</p>',
        }),
        404,
      )
    }
    c.header('Cache-Control', 'public, max-age=3600')
    return c.html(docPage(doc))
  })
