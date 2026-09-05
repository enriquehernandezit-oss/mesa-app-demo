import * as Sentry from '@sentry/bun'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { auth } from './auth'
import type { AppEnv } from './context'
import { sessionMiddleware } from './middleware/session'
import { activityRoutes } from './routes/activity'
import { cheersRoutes } from './routes/cheers'
import { dishesRoutes } from './routes/dishes'
import { feedRoutes } from './routes/feed'
import { inviteRoutes } from './routes/invites'
import { leaderboardRoutes } from './routes/leaderboard'
import { listsRoutes } from './routes/lists'
import { meRoutes } from './routes/me'
import { moderationRoutes } from './routes/moderation'
import { onboardingRoutes } from './routes/onboarding'
import { rankingsRoutes } from './routes/rankings'
import { restaurantRoutes } from './routes/restaurants'
import { savedRoutes } from './routes/saved'
import { sharePagesRoutes } from './routes/share-pages'
import { socialRoutes } from './routes/social'

// Crash reporting. Env-gated and soft: unlike email (which refuses to boot
// without its key, because password reset silently failing is a correctness
// bug), a missing DSN just means no reports — the API serves fine either way.
// Init before the app so anything thrown during setup is caught too.
const SENTRY_DSN = process.env.SENTRY_DSN
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    // Off deliberately: this is a single small instance, and traces would cost
    // far more than they'd tell us. Errors are the signal worth paying for.
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}

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
// frame-ancestors and HSTS are the reason this exists: they only work as
// response headers, never as a <meta> CSP, so without these there'd be no
// clickjacking protection on the surfaces this server owns (/p/* share pages
// and the static catalog art).
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
      // Covers resolve two ways in absoluteCover(): a Cloudinary delivery URL,
      // or — for every seeded row today — a local /restaurants/*.jpg, which
      // this server now serves itself, hence 'self'. (These used to come from
      // the separate web origin; that app is retired.) Crawlers don't enforce
      // CSP, so getting this wrong fails silently for humans who open the link
      // while the OG unfurl still looks fine — worth being exact about.
      imgSrc: ["'self'", 'https://res.cloudinary.com', 'data:'],
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

// Seeded catalog/dish photos. These used to be served by the web app out of its
// public/ dir, so the seed stores root-relative paths ("/restaurants/x.jpg").
// The native app has no web origin to resolve those against, so the API — the
// one surface that survives the web cutover — serves them and the client
// resolves the path against the API origin (apps/mobile/src/lib/media.ts).
// Public, mounted before the session middleware: they're catalog art, not
// member data.
app.use('/restaurants/*', serveStatic({ root: './apps/api/public' }))

// Resolve the current user for every other route.
app.use('*', sessionMiddleware)

app.get('/health', (c) => c.json({ ok: true, service: 'mesa-api' }))

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
app.route('/invites', inviteRoutes)

// Uniform JSON error + 404 handling.
app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => {
  console.error(err)
  // The route and method are the whole diagnosis most of the time; the URL can
  // carry ids but never credentials (auth goes through Better Auth's own paths).
  Sentry.captureException(err, {
    tags: { method: c.req.method, path: new URL(c.req.url).pathname },
  })
  return c.json({ error: 'internal_error' }, 500)
})

const port = Number(process.env.PORT ?? 3000)

export default {
  port,
  fetch: app.fetch,
}
