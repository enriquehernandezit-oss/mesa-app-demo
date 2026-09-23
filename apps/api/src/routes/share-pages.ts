import { db, schema } from '@mesa/db'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AppEnv } from '../context'
import { esc, layout, notFound, publicOrigin } from '../lib/publicPage'

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

const {
  rankings,
  vibeNotes,
  restaurants,
  user,
  invites,
  plans,
  collections,
  collectionItems,
  dishes,
  dishLists,
  dishListItems,
  lists,
  listItems,
} = schema

// Santo Domingo has no DST, so a fixed offset TZ is safe to hardcode — every
// plan date on this page (and everywhere else plans render) is pinned to it
// rather than the reader's own device, since "8:00 pm" in a WhatsApp share
// should mean Santo Domingo time regardless of who's reading it.
const planDateFormatter = new Intl.DateTimeFormat('es-DO', {
  timeZone: 'America/Santo_Domingo',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

// Scores are stored 0–100, always shown 0–10 (never stars). Mirrors the app's
// lib/display.ts so the public page reads identically to the in-app passport.
const d10 = (score: number) => (score / 10).toFixed(1)

// Absolute, crawler-reachable cover URL. Same precedence as the client's
// media.ts: a full URL (an R2 upload, or a legacy value) passes through; a
// local /restaurants/*.jpg path is resolved against THIS server's own public
// origin (which serves those files) — via lib/publicPage's publicOrigin(),
// the same PUBLIC_API_URL → BETTER_AUTH_URL → APP_ORIGINS[0] fallback chain
// the emailed auth links already use, so a cover doesn't go missing just
// because only one of those two vars is set. Null → the page renders
// imageless — there's no bare-id branch here the way media.ts has none
// either: every coverImageId is already a full URL or a seed path by the
// time it reaches this function.
function absoluteCover(coverImageId: string | null): string | null {
  if (!coverImageId) return null
  if (coverImageId.startsWith('http')) return coverImageId
  if (coverImageId.startsWith('/')) return `${publicOrigin()}${coverImageId}`
  return null
}

// "por Mesa" / "por @handle" / "por Name" — mirrors the app's own
// listAuthorLabel() (lib/display.ts) so a curated list's card, its in-app
// detail page, and this public page never disagree. Re-implemented rather
// than imported: this file renders Spanish-only (see the header comment),
// while the client version is language-aware.
function listAuthorByline(l: {
  authorKind: 'mesa' | 'creator' | 'venue'
  authorName: string | null
  authorHandle: string | null
}): string {
  if (l.authorKind !== 'mesa') {
    if (l.authorHandle) return `por @${l.authorHandle}`
    if (l.authorName) return `por ${l.authorName}`
  }
  return 'por Mesa'
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

  // A group dinner's public preview — what a WhatsApp share unfurls into. The
  // uuid alone is the access control (unguessable), same trust model as the
  // in-app link. Deliberately narrower than the in-app screens: who's coming
  // is nobody's business but the host's and the invitees', so the guest list
  // never appears here — only the host, the spot(s), and when.
  .get('/plan/:planId', async (c) => {
    const canonical = c.req.url
    // Shorter than the other pages' 300s: a plan's headline fact (which spot
    // won, if it was a vote) can change the instant the host confirms it.
    c.header('Cache-Control', 'public, max-age=60')
    const planId = c.req.param('planId')

    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
      columns: { status: true, startsAt: true, chosenRestaurantId: true },
      with: {
        host: { columns: { name: true, handle: true, bannedAt: true } },
        options: {
          orderBy: (t, { asc: ascOrder }) => ascOrder(t.position),
          with: { restaurant: { columns: { id: true, name: true, coverImageId: true } } },
        },
      },
    })
    if (!plan || plan.status === 'cancelled' || plan.host.bannedAt) {
      return c.html(notFound(canonical), 404)
    }

    const who = plan.host.name || (plan.host.handle ? `@${plan.host.handle}` : 'Alguien')
    const chosen = plan.options.find((o) => o.restaurant.id === plan.chosenRestaurantId)?.restaurant
    const spotNames = plan.options.map((o) => o.restaurant.name)
    const dateLabel = planDateFormatter.format(plan.startsAt)
    const cover = absoluteCover(
      chosen?.coverImageId ?? plan.options[0]?.restaurant.coverImageId ?? null,
    )

    const title = `${who} armó una mesa`
    const description = chosen
      ? `${chosen.name} · ${dateLabel}`
      : `Votación: ${spotNames.join(' · ')} · ${dateLabel}`

    const body = `
      ${cover ? `<img class="cover" src="${esc(cover)}" alt="" />` : ''}
      <p class="eyebrow">Mesa · ${esc(dateLabel)}</p>
      <h1>${esc(chosen ? chosen.name : `Votación: ${spotNames.join(' · ')}`)}</h1>
      <div class="stat">Organiza ${esc(who)}</div>`

    return c.html(layout({ title, description, image: cover, canonical, body }))
  })

  // A curated list's public preview (M8) — the editorial carousel's detail
  // page, unauthenticated. Own query rather than routes/lists.ts's handler
  // (which is requireAuth'd and computes viewer-relative friend/mine scores
  // that don't exist for an anonymous reader) — same "each page does its own
  // fixed query" shape as every handler above. No score column: a curated
  // list has no score of its own, only whatever a signed-in viewer brings to
  // it, so this renders position + name only (list--noscore).
  .get('/list/:slug', async (c) => {
    const canonical = c.req.url
    c.header('Cache-Control', 'public, max-age=300')
    const slug = c.req.param('slug')

    const list = await db.query.lists.findFirst({
      where: eq(lists.slug, slug),
      columns: {
        id: true,
        title: true,
        subtitle: true,
        coverImageId: true,
        authorKind: true,
        authorName: true,
        authorHandle: true,
      },
    })
    if (!list) return c.html(notFound(canonical), 404)

    const rows = await db
      .select({
        position: listItems.position,
        name: restaurants.name,
        coverImageId: restaurants.coverImageId,
      })
      .from(listItems)
      .innerJoin(restaurants, eq(restaurants.id, listItems.restaurantId))
      .where(eq(listItems.listId, list.id))
      .orderBy(asc(listItems.position))
      .limit(20)

    const byline = listAuthorByline(list)
    const cover = absoluteCover(list.coverImageId) ?? absoluteCover(rows[0]?.coverImageId ?? null)
    const description = list.subtitle
      ? `${list.subtitle} — ${byline}.`
      : rows.length > 0
        ? `${rows
            .slice(0, 3)
            .map((r) => r.name)
            .join(' · ')} — ${byline}.`
        : `${byline}.`

    const body = `
      ${cover ? `<img class="cover" src="${esc(cover)}" alt="" />` : ''}
      <p class="eyebrow">Lista · ${esc(byline)}</p>
      <h1>${esc(list.title)}</h1>
      ${
        rows.length > 0
          ? `<ol class="list list--noscore">${rows
              .map(
                (r) =>
                  `<li><span class="pos">${r.position}</span><span class="nm">${esc(
                    r.name,
                  )}</span></li>`,
              )
              .join('')}</ol>`
          : ''
      }`

    return c.html(layout({ title: list.title, description, image: cover, canonical, body }))
  })

  // A member's named list (M8/M19) — public the same way a profile or a plan
  // is: gated by an unguessable id, not a real access-control flag (collections
  // have never had a privacy toggle). A dish item keeps the poster's own
  // visibility choice, though — a 'friends'-only dish can't be named (or its
  // photo used) on a page anyone can load with no session, the same rule
  // GET /dishes/:id enforces for a signed-in stranger.
  .get('/collection/:id', async (c) => {
    const canonical = c.req.url
    c.header('Cache-Control', 'public, max-age=300')
    const id = c.req.param('id')

    const collection = await db.query.collections.findFirst({
      where: eq(collections.id, id),
      columns: { name: true, description: true, coverImageId: true, userId: true },
    })
    if (!collection) return c.html(notFound(canonical), 404)

    const owner = await db.query.user.findFirst({
      where: eq(user.id, collection.userId),
      columns: { name: true, handle: true, bannedAt: true },
    })
    if (!owner || owner.bannedAt) return c.html(notFound(canonical), 404)

    const rawRows = await db
      .select({
        restaurantName: restaurants.name,
        restaurantCover: restaurants.coverImageId,
        dishName: dishes.name,
        dishImage: dishes.imageId,
        dishVisibility: dishes.visibility,
      })
      .from(collectionItems)
      .leftJoin(restaurants, eq(restaurants.id, collectionItems.restaurantId))
      .leftJoin(dishes, eq(dishes.id, collectionItems.dishId))
      .where(eq(collectionItems.collectionId, id))
      .orderBy(desc(collectionItems.createdAt))
      .limit(20)

    // No stored position (the in-app list orders by createdAt too) — the
    // display ordinal below is synthetic, same visual language as a real one.
    const items = rawRows
      .filter((r) => r.restaurantName || r.dishVisibility === 'public')
      .map((r, i) => ({
        position: i + 1,
        name: (r.restaurantName ?? r.dishName) as string,
        coverImageId: r.restaurantCover ?? (r.dishVisibility === 'public' ? r.dishImage : null),
      }))

    const who = owner.name || `@${owner.handle}`
    const cover =
      absoluteCover(collection.coverImageId) ?? absoluteCover(items[0]?.coverImageId ?? null)
    const description =
      items.length > 0
        ? `${items
            .slice(0, 3)
            .map((i) => i.name)
            .join(' · ')} — la lista de ${who} en Mesa.`
        : `La lista de ${who} en Mesa.`

    const body = `
      ${cover ? `<img class="cover" src="${esc(cover)}" alt="" />` : ''}
      <p class="eyebrow">Lista · de ${esc(who)}</p>
      <h1>${esc(collection.name)}</h1>
      ${collection.description ? `<div class="stat">${esc(collection.description)}</div>` : ''}
      ${
        items.length > 0
          ? `<ol class="list list--noscore">${items
              .map(
                (i) =>
                  `<li><span class="pos">${i.position}</span><span class="nm">${esc(
                    i.name,
                  )}</span></li>`,
              )
              .join('')}</ol>`
          : ''
      }`

    return c.html(
      layout({
        title: `${collection.name} · lista de ${who}`,
        description,
        image: cover,
        canonical,
        body,
      }),
    )
  })

  // A member's dish ranking (M8/M20) — "la mejor carbonara de Camila en la
  // ciudad." Only once it's actually ranked: an in-progress pairwise session
  // has no order yet, so a link shared mid-flow (there's no share button
  // before rankedAt anyway, but the route itself must not assume that) has
  // nothing here for a stranger to land on.
  .get('/dish-list/:id', async (c) => {
    const canonical = c.req.url
    c.header('Cache-Control', 'public, max-age=300')
    const id = c.req.param('id')

    const list = await db.query.dishLists.findFirst({
      where: eq(dishLists.id, id),
      columns: { label: true, userId: true, nameKey: true, rankedAt: true },
    })
    if (!list || !list.rankedAt) return c.html(notFound(canonical), 404)

    const owner = await db.query.user.findFirst({
      where: eq(user.id, list.userId),
      columns: { name: true, handle: true, bannedAt: true },
    })
    if (!owner || owner.bannedAt) return c.html(notFound(canonical), 404)

    const rows = await db
      .select({
        position: dishListItems.position,
        name: restaurants.name,
        restaurantCover: restaurants.coverImageId,
        dishImage: dishes.imageId,
        dishVisibility: dishes.visibility,
      })
      .from(dishListItems)
      .innerJoin(restaurants, eq(restaurants.id, dishListItems.restaurantId))
      .leftJoin(
        dishes,
        and(
          eq(dishes.userId, list.userId),
          eq(dishes.nameKey, list.nameKey),
          eq(dishes.restaurantId, dishListItems.restaurantId),
          isNull(dishes.removedAt),
        ),
      )
      .where(eq(dishListItems.listId, id))
      .orderBy(asc(dishListItems.position))
      .limit(20)

    const who = owner.name || `@${owner.handle}`
    const first = rows[0]
    const firstCover = first
      ? ((first.dishVisibility === 'public' ? first.dishImage : null) ?? first.restaurantCover)
      : null
    const cover = absoluteCover(firstCover)
    const description =
      rows.length > 0
        ? `${rows
            .slice(0, 3)
            .map((r) => r.name)
            .join(' · ')} — el ranking de ${who} en Mesa.`
        : `El ranking de ${who} en Mesa.`

    const body = `
      ${cover ? `<img class="cover" src="${esc(cover)}" alt="" />` : ''}
      <p class="eyebrow">${esc(list.label)} · de ${esc(who)}</p>
      <h1>${esc(list.label)}</h1>
      <ol class="list list--noscore">
        ${rows
          .map(
            (r) =>
              `<li><span class="pos">${r.position}</span><span class="nm">${esc(
                r.name,
              )}</span></li>`,
          )
          .join('')}
      </ol>`

    return c.html(
      layout({
        title: `${list.label} · el ranking de ${who}`,
        description,
        image: cover,
        canonical,
        body,
      }),
    )
  })
