import { Hono } from 'hono'

// M0: the API boots and answers a health check. Milestone 1 adds the typed
// route structure, request-context (current user), Better Auth, and the DB.
const app = new Hono()

app.get('/health', (c) => c.json({ ok: true, service: 'mesa-api' }))

const port = Number(process.env.PORT ?? 3000)

export default {
  port,
  fetch: app.fetch,
}
