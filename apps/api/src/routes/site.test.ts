import { describe, expect, test } from 'bun:test'

import { Hono } from 'hono'

import type { AppEnv } from '../context'
import { SUPPORT_EMAIL, reportPageHref } from '../lib/support'
import { siteRoutes } from './site'

// The public home and support pages: no account, no javascript, and the one support address everywhere.
// Static HTML — no database — so these run everywhere, CI included.
const app = new Hono<AppEnv>().route('/', siteRoutes)
const get = async (path: string) => {
  const res = await app.request(path)
  return { res, html: await res.text() }
}

describe('home page', () => {
  test('is public, says what Mesa is, and links to the legal pages and support', async () => {
    const { res, html } = await get('/')
    expect(res.status).toBe(200)
    expect(html).toContain('<div class="mark">mesa</div>')
    expect(html).toContain('Donde tus amigos')
    expect(html).toContain('href="/support"')
    expect(html).toContain('href="/legal/privacy"')
    expect(html).toContain('href="/legal/terms"')
  })

  test('ships no javascript', async () => {
    for (const path of ['/', '/support']) {
      const { html } = await get(path)
      expect(html).not.toContain('<script')
      expect(html).not.toContain('onclick')
    }
  })
})

describe('support page', () => {
  test('gives the support address, how to report and how to delete an account', async () => {
    const { res, html } = await get('/support')
    expect(res.status).toBe(200)
    expect(html).toContain(`mailto:${SUPPORT_EMAIL}`)
    expect(html).toContain('Reportar contenido')
    expect(html).toContain('Eliminar cuenta')
    expect(html).toContain('24 horas')
  })
})

describe('reportPageHref', () => {
  test('a mailto to the support address that names the page', () => {
    const href = reportPageHref('https://mesasocial.app/p/spot/abc')
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true)
    expect(decodeURIComponent(href)).toContain('https://mesasocial.app/p/spot/abc')
  })
})
