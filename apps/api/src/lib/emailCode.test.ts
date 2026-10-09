import { describe, expect, test } from 'bun:test'

import { existingAccountMail, shouldSendExistingNotice } from './emailCode'

describe('the existing-account notice', () => {
  test('says, in Spanish then English, that they already have an account', () => {
    const mail = existingAccountMail()
    expect(mail.subject).toContain('cuenta')
    expect(mail.body).toContain('ya tienes una')
    expect(mail.body).toContain('you already have one')
  })

  test('goes out at most once an hour per address, case aside', () => {
    const t0 = 1_000_000_000_000
    expect(shouldSendExistingNotice('Ana@Example.test', t0)).toBe(true)
    expect(shouldSendExistingNotice('ana@example.test', t0 + 30 * 60 * 1000)).toBe(false)
    expect(shouldSendExistingNotice('otra@example.test', t0 + 30 * 60 * 1000)).toBe(true)
    expect(shouldSendExistingNotice('ana@example.test', t0 + 61 * 60 * 1000)).toBe(true)
  })
})
