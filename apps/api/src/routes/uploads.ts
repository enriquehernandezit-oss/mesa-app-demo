import { Hono } from 'hono'

import type { AuthedEnv } from '../context'
import { presignUpload, r2Enabled } from '../lib/r2'
import { requireAuth } from '../middleware/session'

// Presigned-upload issuer for member photos (dish posts, avatars, collection
// covers) — see lib/r2.ts's own header. The phone PUTs the file straight to
// R2 with the URL this hands back; this route never sees the image bytes.
//
// `available: false` on a 200, not a 4xx/5xx, when R2 isn't configured — same
// graceful-dark convention as PHONE_MATCH_SECRET in routes/social.ts. A real
// error status here would have the client's api.ts auto-report every attempt
// to PostHog as a server fault, when "uploads aren't turned on yet" is an
// expected, not exceptional, state during the beta.
export const uploadsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  .post('/', (c) => {
    if (!r2Enabled()) return c.json({ available: false as const })
    const me = c.get('user')
    return c.json({ available: true as const, ...presignUpload(me.id) })
  })
