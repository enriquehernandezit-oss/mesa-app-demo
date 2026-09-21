import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { LEGAL_DOCS, type LegalDocId } from '../lib/legalCopy'
import { legalPagesRoutes } from './legal-pages'

// The legal pages are the one surface App Store Connect opens without an
// account, so what this file really guards is "public": the sub-app is mounted
// with no session middleware and no requireAuth, and a bare request has to get
// the whole document back. Everything here is static copy — no DB, so unlike
// events.test.ts these run everywhere, including CI.

const app = new Hono<AppEnv>().route('/legal', legalPagesRoutes)
const get = (path: string) => app.request(path)

const ids = Object.keys(LEGAL_DOCS) as LegalDocId[]

describe('legal pages', () => {
  test.each(ids)('/legal/%s serves the document with no auth', async (id) => {
    const res = await get(`/legal/${id}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    const doc = LEGAL_DOCS[id]
    expect(html).toContain(`<h1>${doc.title}</h1>`)
    expect(html).toContain('<title>')
    expect(html).toContain(doc.updated)
    // Every section makes it to the page, not just the first screenful.
    for (const section of doc.sections) expect(html).toContain(section.heading)
  })

  test('/legal lists all three documents', async () => {
    const res = await get('/legal')
    expect(res.status).toBe(200)
    const html = await res.text()
    for (const id of ids) {
      expect(html).toContain(`href="/legal/${id}"`)
      expect(html).toContain(LEGAL_DOCS[id].title)
    }
  })

  test('an unknown document is a 404, not a redirect to something else', async () => {
    const res = await get('/legal/cookies')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('No encontrado')
  })

  test('the pages are self-contained: no scripts, no external requests', async () => {
    for (const id of ids) {
      const html = await (await get(`/legal/${id}`)).text()
      expect(html).not.toContain('<script')
      // A legal page that quietly fetches a web font or a pixel would make the
      // document it is serving untrue.
      expect(html).not.toContain('//fonts.')
      expect(html).not.toContain('src="http')
      expect(html).not.toContain('href="http')
    }
  })

  test('no draft or internal notes survive in the published copy', async () => {
    for (const id of ids) {
      const text = JSON.stringify(LEGAL_DOCS[id]).toLowerCase()
      // ("todo" is not on this list on purpose — it is an ordinary Spanish
      // word, and half the documents use it.)
      // "App Store" on its own is legitimate (the EULA cites Apple's Usage
      // Rules); a numbered guideline is an internal note that leaked.
      for (const word of ['borrador', 'pendiente de revisión', 'app store 1.', 'app store 5.']) {
        expect(text).not.toContain(word)
      }
    }
  })
})
