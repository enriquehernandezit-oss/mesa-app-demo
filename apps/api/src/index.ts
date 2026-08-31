import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { auth } from './auth'
import type { AppEnv } from './context'
import { sessionMiddleware } from './middleware/session'
import { activityRoutes } from './routes/activity'
import { cheersRoutes } from './routes/cheers'
import { dishesRoutes } from './routes/dishes'
import { feedRoutes } from './routes/feed'
import { leaderboardRoutes } from './routes/leaderboard'
import { listsRoutes } from './routes/lists'
import { meRoutes } from './routes/me'
import { moderationRoutes } from './routes/moderation'
import { onboardingRoutes } from './routes/onboarding'
import { rankingsRoutes } from './routes/rankings'
import { restaurantRoutes } from './routes/restaurants'
import { savedRoutes } from './routes/saved'
import { sharePagesRoutes, webOrigin } from './routes/share-pages'
import { socialRoutes } from './routes/social'

const app = new Hono<AppEnv>()

// Security response headers. First middleware, so it also covers the Better Auth
// handler below and anything app.onError returns. Headers are applied on the way
// OUT (after next()), so a middleware registered earlier wraps a later one and
// its values win — which is what gives /p its own CSP below.
//
// Two surfaces with genuinely different needs, so two policies rather than one
// loose compromise:
//   - everything else is JSON, never a document -> lock it to nothing at all.
//   - /p/* is real server-rendered HTML (share pages) -> it needs Google Fonts
//     and Cloudinary covers, but it ships ZERO javascript, so script-src stays
//     'none'. That is a tighter script policy than the SPA can have.
//
// frame-ancestors and HSTS are the reason this exists: the app's build-time CSP
// is a <meta> tag, and browsers ignore both of those in meta — they only work as
// response headers. Until now nothing set them anywhere, so there was no
// clickjacking protection at all. The web app gets the same treatment via
// apps/app/public/serve.json.
// The web origin share-page covers are served from — same resolution the pages
// themselves use, so the policy can never drift from the markup.
const SHARE_IMG_ORIGIN = webOrigin()

const COMMON_HEADERS = {
  // One year. Deliberately NO `preload`: preload is effectively irreversible and
  // would be submitted for a *.up.railway.app domain we don't own. Revisit once
  // the real domain is live.
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  xFrameOptions: 'DENY',
  referrerPolicy: 'no-referrer',
  // COEP would require every cross-origin subresource to opt in via CORP —
  // Cloudinary covers on the share pages don't, and we gain nothing here.
  crossOriginEmbedderPolicy: false,
} as const

app.use(
  '/p/*',
  secureHeaders({
    ...COMMON_HEADERS,
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ['https://fonts.gstatic.com'],
      // Covers resolve three ways in absoluteCover(): a Cloudinary delivery
      // URL, or — for every seeded row today — a local /restaurants/*.jpg
      // served from the WEB origin, which is a different host than this API.
      // Omitting that origin blocks the cover on every share page (the OG
      // unfurl still works, since crawlers don't enforce CSP — so this would
      // have failed silently for anyone who actually opened the link).
      imgSrc: [
        'https://res.cloudinary.com',
        'data:',
        ...(SHARE_IMG_ORIGIN ? [SHARE_IMG_ORIGIN] : []),
      ],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  }),
)

app.use(
  '*',
  secureHeaders({
    ...COMMON_HEADERS,
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  }),
)

// CORS for the Vite app / Capacitor webview. credentials:true lets the session
// cookie ride along for same-origin/first-party web; exposeHeaders lets the
// client JS READ the Better Auth `set-auth-token` header on a cross-origin
// response, so it can store the Bearer token — the auth path that works where
// cross-site cookies are blocked (iOS Safari, the Capacitor native shell).
app.use(
  '*',
  cors({
    origin: (process.env.APP_ORIGINS ?? 'http://localhost:5173').split(','),
    credentials: true,
    exposeHeaders: ['set-auth-token'],
  }),
)

// Better Auth owns everything under /api/auth/* (sign-in, OAuth callbacks, OTP).
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

// PUBLIC share pages (the growth loop's return path) — server-rendered HTML with
// OG meta, hit by link crawlers and logged-out visitors. Mounted before the
// session middleware so they need no cookie and never touch auth.
app.route('/p', sharePagesRoutes)

// Resolve the current user for every other route.
app.use('*', sessionMiddleware)

app.get('/health', (c) => c.json({ ok: true, service: 'mesa-api' }))

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY — DELETE THIS BLOCK. Probe for M2 (auth rate limiting).
//
// Better Auth keys its rate limits by IP alone, and derives that IP from
// x-forwarded-for using one specific rule: if the header holds anything other
// than exactly ONE address, it gives up and returns null — and every request
// that resolves to null shares a single rate-limit bucket. We cannot tell from
// here which way Railway's proxy behaves, and the two possibilities need
// opposite fixes:
//
//   • proxy APPENDS to the header -> a caller who sends their own
//     x-forwarded-for makes it two-valued -> null -> one shared bucket for
//     everyone -> a handful of requests can lock sign-in for all users.
//   • proxy REPLACES the header  -> a caller can forge any IP they like and
//     the per-IP limit is trivially bypassed.
//
// Local testing cannot answer this: Better Auth short-circuits to a localhost
// IP in development. Hence a probe against the real deployment.
//
// It reflects only the caller's OWN proxy headers back to them — no secrets, no
// other user's data — and comes out in the very next commit.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/__ip-probe', (c) => {
  const header = (name: string) => c.req.header(name) ?? null
  const xff = header('x-forwarded-for')

  // Mirrors @better-auth/core/dist/utils/ip.mjs getIPFromHeader() for the
  // no-trusted-proxies case: split on commas, and bail to null unless exactly
  // one value survives. This is the value the rate limiter would key on.
  const parts = (xff ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const derivedIp = parts.length === 1 ? parts[0] : null

  return c.json({
    'x-forwarded-for': xff,
    'x-real-ip': header('x-real-ip'),
    'x-envoy-external-address': header('x-envoy-external-address'),
    'cf-connecting-ip': header('cf-connecting-ip'),
    forwardedValueCount: parts.length,
    betterAuthWouldKeyOn: derivedIp,
    sharedBucket: derivedIp === null,
  })
})

// Feature routes (typed, mounted under a clear prefix).
app.route('/me', meRoutes)
app.route('/onboarding', onboardingRoutes)
app.route('/social', socialRoutes)
app.route('/rankings', rankingsRoutes)
app.route('/saved', savedRoutes)
app.route('/moderation', moderationRoutes)
app.route('/feed', feedRoutes)
app.route('/restaurants', restaurantRoutes)
app.route('/cheers', cheersRoutes)
app.route('/leaderboard', leaderboardRoutes)
app.route('/lists', listsRoutes)
app.route('/dishes', dishesRoutes)
app.route('/activity', activityRoutes)

// Uniform JSON error + 404 handling.
app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal_error' }, 500)
})

const port = Number(process.env.PORT ?? 3000)

export default {
  port,
  fetch: app.fetch,
}
