import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { auth } from './auth'
import type { AppEnv } from './context'
import { sessionMiddleware } from './middleware/session'
import { activityRoutes } from './routes/activity'
import { cheersRoutes } from './routes/cheers'
import { feedRoutes } from './routes/feed'
import { leaderboardRoutes } from './routes/leaderboard'
import { meRoutes } from './routes/me'
import { moderationRoutes } from './routes/moderation'
import { onboardingRoutes } from './routes/onboarding'
import { rankingsRoutes } from './routes/rankings'
import { restaurantRoutes } from './routes/restaurants'
import { savedRoutes } from './routes/saved'
import { sharePagesRoutes } from './routes/share-pages'
import { socialRoutes } from './routes/social'

const app = new Hono<AppEnv>()

// CORS for the Vite app / Capacitor webview; credentials so the session cookie
// rides along.
app.use(
  '*',
  cors({
    origin: (process.env.APP_ORIGINS ?? 'http://localhost:5173').split(','),
    credentials: true,
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
