import { afterEach, describe, expect, test } from 'bun:test'

import { Hono } from 'hono'

import type { AppEnv } from '../context'
import { wellKnownRoutes } from './well-known'

const app = new Hono<AppEnv>().route('/.well-known', wellKnownRoutes)
const get = () => app.request('/.well-known/apple-app-site-association')

const saved = { team: process.env.APPLE_TEAM_ID, bundle: process.env.APPLE_APP_BUNDLE_ID }
afterEach(() => {
  for (const [k, v] of [
    ['APPLE_TEAM_ID', saved.team],
    ['APPLE_APP_BUNDLE_ID', saved.bundle],
  ] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('apple-app-site-association', () => {
  test('is a 404 until the Apple team id is set', async () => {
    delete process.env.APPLE_TEAM_ID
    expect((await get()).status).toBe(404)
  })

  test('names the team and the app, and claims the /p pages', async () => {
    process.env.APPLE_TEAM_ID = 'ABCDE12345'
    delete process.env.APPLE_APP_BUNDLE_ID
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({
      applinks: {
        details: [{ appIDs: ['ABCDE12345.com.mesasocial.app'], components: [{ '/': '/p/*' }] }],
      },
    })
  })

  test('uses the configured bundle id when there is one', async () => {
    process.env.APPLE_TEAM_ID = 'ABCDE12345'
    process.env.APPLE_APP_BUNDLE_ID = 'com.example.other'
    const body = (await (await get()).json()) as {
      applinks: { details: { appIDs: string[] }[] }
    }
    expect(body.applinks.details[0]?.appIDs).toEqual(['ABCDE12345.com.example.other'])
  })
})
