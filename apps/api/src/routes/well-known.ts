import { Hono } from 'hono'

import type { AppEnv } from '../context'

// The file iOS fetches from the link domain to learn which paths belong to the app. Without it a
// shared Mesa link opens Safari even for someone who has the app; with it the same tap opens the
// right screen (apps/mobile/src/lib/deepLinks.ts turns the /p/* path into one).
//
// Dormant until APPLE_TEAM_ID is set, so the API ships before the domain exists: answering with a
// file that names no team would be worse than a 404. The domain it is served on must be the one the
// app is built with (APP_LINK_DOMAIN, apps/mobile/app.config.js) and the one share links use
// (PUBLIC_WEB_URL). Mounted before the session middleware, like /p/*: Apple's fetch has no cookie.
const BUNDLE_ID = 'com.mesasocial.app'

export const wellKnownRoutes = new Hono<AppEnv>().get('/apple-app-site-association', (c) => {
  const team = process.env.APPLE_TEAM_ID?.trim()
  if (!team) return c.json({ error: 'not_found' }, 404)
  const bundle = process.env.APPLE_APP_BUNDLE_ID?.trim() || BUNDLE_ID
  c.header('Cache-Control', 'public, max-age=3600')
  // Every public page the app can open — spots, people, plans, lists, collections, dish lists,
  // invites and the two auth links. The legal pages stay on the web.
  return c.json({
    applinks: {
      details: [{ appIDs: [`${team}.${bundle}`], components: [{ '/': '/p/*' }] }],
    },
  })
})
