import { db, schema } from '@mesa/db'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'

// PUBLIC share pages — the growth loop's return path. When a user shares their
// ranking, the share text carries a link here. These pages are server-rendered
// HTML (crawlers don't run JS) with Open Graph / Twitter meta, so the link
// unfurls into a rich preview in WhatsApp / iMessage / Instagram, and whoever
// taps it lands on a branded page with a "get Mesa" call to action.
//
// Mounted at /p BEFORE the session middleware: no auth, no cookie, safe for
// crawlers. Everything rendered from user data is HTML-escaped.

const { rankings, vibeNotes, restaurants, user } = schema

// Scores are stored 0–100, always shown 0–10 (never stars). Mirrors the app's
// lib/display.ts so the public page reads identically to the in-app passport.
const d10 = (score: number) => (score / 10).toFixed(1)

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// The web app's origin — where "get Mesa" and cover assets live. In dev this is
// the Vite origin (APP_ORIGINS default); in prod, set PUBLIC_WEB_URL to the
// deployed web build. Falls back gracefully so nothing breaks unconfigured.
export function webOrigin(): string | null {
  return process.env.PUBLIC_WEB_URL ?? process.env.APP_ORIGINS?.split(',')[0] ?? null
}

// Absolute, crawler-reachable cover URL. Same precedence as the client's
// media.ts: full URLs pass through; a local /restaurants/*.jpg path is resolved
// against the web origin; a bare id becomes a Cloudinary delivery URL when a
// cloud is configured. Null → the page renders without an image.
function absoluteCover(coverImageId: string | null): string | null {
  if (!coverImageId) return null
  if (coverImageId.startsWith('http')) return coverImageId
  if (coverImageId.startsWith('/')) {
    const web = webOrigin()
    return web ? `${web}${coverImageId}` : null
  }
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  return cloud
    ? `https://res.cloudinary.com/${cloud}/image/upload/c_fill,w_1200,h_630,q_auto,f_auto/${coverImageId}`
    : null
}

function ctaHref(): string {
  return webOrigin() ?? '/'
}

// One branded HTML shell — oxblood ground, cream serif, brass accents — shared
// by both page types. Only `body` differs per page.
function layout(opts: {
  title: string
  description: string
  image: string | null
  canonical: string
  body: string
}): string {
  const { title, description, image, canonical, body } = opts
  const imgTags = image
    ? `<meta property="og:image" content="${esc(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${esc(image)}" />`
    : '<meta name="twitter:card" content="summary" />'
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
  </style>
</head>
<body>
  <main class="wrap">
    <div class="mark">mesa</div>
    ${body}
    <a class="cta" href="${esc(ctaHref())}">Ábrelo en Mesa</a>
    <p class="tagline">where your friends actually eat</p>
  </main>
</body>
</html>`
}

function notFound(canonical: string): string {
  return layout({
    title: 'Mesa',
    description: 'Where your friends actually eat — Santo Domingo.',
    image: null,
    canonical,
    body: '<div class="missing"><h1>No encontrado</h1><p class="stat">Este enlace ya no existe.</p></div>',
  })
}

export const sharePagesRoutes = new Hono<AppEnv>()

  // A user's public passport — their top spots, the identity flex that makes a
  // friend tap "who's this?" and land in the funnel. Two fixed queries, no loop.
  .get('/u/:handle', async (c) => {
    const canonical = c.req.url
    c.header('Cache-Control', 'public, max-age=300')
    const handle = c.req.param('handle').replace(/^@/, '')

    const target = await db.query.user.findFirst({
      where: eq(user.handle, handle),
      columns: { id: true, name: true, handle: true, bannedAt: true },
      with: { neighborhood: { columns: { name: true } } },
    })
    if (!target || target.bannedAt) return c.html(notFound(canonical), 404)

    const rows = await db
      .select({
        position: rankings.position,
        score: rankings.score,
        name: restaurants.name,
        coverImageId: restaurants.coverImageId,
      })
      .from(rankings)
      .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
      .where(eq(rankings.userId, target.id))
      .orderBy(asc(rankings.position))
      .limit(8)

    const who = target.name || `@${target.handle}`
    const hood = target.neighborhood?.name ?? 'Santo Domingo'
    const title = `${who} · Top ${rows.length} en Mesa`
    const description =
      rows.length > 0
        ? `${rows
            .slice(0, 3)
            .map((r) => r.name)
            .join(' · ')} — el ranking de ${who} en ${hood}.`
        : `El ranking de ${who} en ${hood}.`

    const body = `
      ${
        rows[0] && absoluteCover(rows[0].coverImageId)
          ? `<img class="cover" src="${esc(absoluteCover(rows[0].coverImageId) as string)}" alt="" />`
          : ''
      }
      <p class="eyebrow">Top ${rows.length} · ${esc(hood)}</p>
      <h1>${esc(who)}</h1>
      <ol class="list">
        ${rows
          .map(
            (r) =>
              `<li><span class="pos">${r.position}</span><span class="nm">${esc(
                r.name,
              )}</span><span class="sc">${d10(r.score)}</span></li>`,
          )
          .join('')}
      </ol>`

    return c.html(
      layout({
        title,
        description,
        image: absoluteCover(rows[0]?.coverImageId ?? null),
        canonical,
        body,
      }),
    )
  })

  // A restaurant's public page — "where friends rank it", the other shared
  // artifact (from the spot card). Fixed queries: restaurant, aggregate, one note.
  .get('/spot/:restaurantId', async (c) => {
    const canonical = c.req.url
    c.header('Cache-Control', 'public, max-age=300')
    const id = c.req.param('restaurantId')

    const r = await db.query.restaurants.findFirst({
      // Public, unauthenticated page — a moderation-removed or permanently
      // closed listing must 404 here, not unfurl a rich preview onward.
      where: and(
        eq(restaurants.id, id),
        isNull(restaurants.removedAt),
        isNull(restaurants.closedAt),
      ),
      columns: { id: true, name: true, cuisine: true, coverImageId: true, priceTier: true },
      with: { neighborhood: { columns: { name: true } } },
    })
    if (!r) return c.html(notFound(canonical), 404)

    const [agg] = await db
      .select({
        count: sql<number>`count(*)::int`,
        avg: sql<number>`avg(${rankings.score})`,
      })
      .from(rankings)
      .where(eq(rankings.restaurantId, id))

    // The note from whoever ranks it highest (lowest position) — the most
    // credible one-line "why".
    const [note] = await db
      .select({ body: vibeNotes.body })
      .from(vibeNotes)
      .innerJoin(
        rankings,
        and(
          eq(rankings.userId, vibeNotes.userId),
          eq(rankings.restaurantId, vibeNotes.restaurantId),
        ),
      )
      .where(and(eq(vibeNotes.restaurantId, id), isNull(vibeNotes.removedAt)))
      .orderBy(asc(rankings.position))
      .limit(1)

    const meta = [r.cuisine, r.neighborhood?.name, r.priceTier ? '$'.repeat(r.priceTier) : null]
      .filter(Boolean)
      .join(' · ')
    const count = agg?.count ?? 0
    const avg = agg?.avg != null ? Number(agg.avg) : null
    const cover = absoluteCover(r.coverImageId)

    const statLine =
      count > 0
        ? `${count} ${count === 1 ? 'persona ha' : 'personas han'} rankeado${
            avg != null ? ` · promedio ${d10(avg)}` : ''
          }`
        : 'Aún nadie lo ha rankeado. Sé el primero.'

    const title = `${r.name} en Mesa`
    const description = `${meta || 'Santo Domingo'} — ${statLine}`

    const body = `
      ${cover ? `<img class="cover" src="${esc(cover)}" alt="" />` : ''}
      <p class="eyebrow">${esc(meta)}</p>
      <h1>${esc(r.name)}</h1>
      <div class="stat">${esc(statLine)}</div>
      ${note ? `<blockquote>“${esc(note.body)}”</blockquote>` : ''}`

    return c.html(layout({ title, description, image: cover, canonical, body }))
  })
