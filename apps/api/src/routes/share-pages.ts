import { db, schema } from '@mesa/db'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { esc, layout, notFound } from '../lib/publicPage'

// PUBLIC share pages — the growth loop's return path. When a user shares their
// ranking, the share text carries a link here. These pages are server-rendered
// HTML (crawlers don't run JS) with Open Graph / Twitter meta, so the link
// unfurls into a rich preview in WhatsApp / iMessage / Instagram, and whoever
// taps it lands on a branded page with a "get Mesa" call to action.
//
// Mounted at /p BEFORE the session middleware: no auth, no cookie, safe for
// crawlers. Everything rendered from user data is HTML-escaped.
//
// The branded shell itself (layout/esc/notFound) lives in lib/publicPage.ts —
// the auth pages served under the same prefix share it.

const { rankings, vibeNotes, restaurants, user, invites } = schema

// Scores are stored 0–100, always shown 0–10 (never stars). Mirrors the app's
// lib/display.ts so the public page reads identically to the in-app passport.
const d10 = (score: number) => (score / 10).toFixed(1)

// This server's own public origin — where the seeded catalog art is served from
// (see the /restaurants/* static route in index.ts). Cover images used to resolve
// against the web app; it's gone, and these files live here now.
function selfOrigin(): string | null {
  return process.env.PUBLIC_API_URL ?? null
}

// Absolute, crawler-reachable cover URL. Same precedence as the client's
// media.ts: full URLs pass through; a local /restaurants/*.jpg path is resolved
// against THIS server (which serves those files); a bare id becomes a Cloudinary
// delivery URL when a cloud is configured. Null → the page renders imageless.
function absoluteCover(coverImageId: string | null): string | null {
  if (!coverImageId) return null
  if (coverImageId.startsWith('http')) return coverImageId
  if (coverImageId.startsWith('/')) {
    const self = selfOrigin()
    return self ? `${self}${coverImageId}` : null
  }
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  return cloud
    ? `https://res.cloudinary.com/${cloud}/image/upload/c_fill,w_1200,h_630,q_auto,f_auto/${coverImageId}`
    : null
}

export const sharePagesRoutes = new Hono<AppEnv>()

  // A user's public passport — their top spots, the identity flex that makes a
  // friend tap "who's this?" and land in the funnel. Two fixed queries, no loop.
  // An invite link. Personalised with who sent it and what they rank highest —
  // an invite that says "someone invited you" converts far worse than one that
  // says "Camila's top 3 in Piantini". The code is carried into the app by
  // +native-intent so attribution survives the tap when Mesa is installed.
  //
  // Never gates anything: this page is a nicer front door, not a key.
  .get('/i/:code', async (c) => {
    const canonical = c.req.url
    c.header('Cache-Control', 'public, max-age=300')
    const code = c.req.param('code').toUpperCase()

    const invite = await db.query.invites.findFirst({
      where: eq(invites.code, code),
      columns: { userId: true },
    })
    if (!invite) return c.html(notFound(canonical), 404)

    const inviter = await db.query.user.findFirst({
      where: eq(user.id, invite.userId),
      columns: { name: true, handle: true, bannedAt: true },
      with: { neighborhood: { columns: { name: true } } },
    })
    if (!inviter || inviter.bannedAt) return c.html(notFound(canonical), 404)

    const rows = await db
      .select({
        position: rankings.position,
        score: rankings.score,
        name: restaurants.name,
        coverImageId: restaurants.coverImageId,
      })
      .from(rankings)
      .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
      .where(eq(rankings.userId, invite.userId))
      .orderBy(asc(rankings.position))
      .limit(3)

    const who = inviter.name || (inviter.handle ? `@${inviter.handle}` : 'Alguien')
    const hood = inviter.neighborhood?.name ?? 'Santo Domingo'
    const title = `${who} te invita a Mesa`
    const description =
      rows.length > 0
        ? `${rows.map((r) => r.name).join(' · ')} — donde come ${who} en ${hood}.`
        : `Donde come ${who} en ${hood}.`

    const body = `
      ${
        rows[0] && absoluteCover(rows[0].coverImageId)
          ? `<img class="cover" src="${esc(absoluteCover(rows[0].coverImageId) as string)}" alt="" />`
          : ''
      }
      <p class="eyebrow">Invitación · ${esc(hood)}</p>
      <h1>${esc(who)} te invita a Mesa</h1>
      ${
        rows.length > 0
          ? `<ol class="list">${rows
              .map(
                (r) =>
                  `<li><span class="pos">${r.position}</span><span class="nm">${esc(
                    r.name,
                  )}</span><span class="sc">${d10(r.score)}</span></li>`,
              )
              .join('')}</ol>`
          : ''
      }`

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
    // Joined to the author so a SUSPENDED member's note can't be quoted here.
    // This page is public and crawler-visible, so it's the one surface where a
    // missed moderation filter is published rather than merely shown in-app.
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
      .innerJoin(user, eq(user.id, vibeNotes.userId))
      .where(
        and(eq(vibeNotes.restaurantId, id), isNull(vibeNotes.removedAt), isNull(user.bannedAt)),
      )
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
