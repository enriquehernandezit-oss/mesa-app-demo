import { describe, expect, test } from 'bun:test'

import { displayScore, layout, notFound, scoreChip, scoreWord } from './publicPage'

// The shell every public page shares. Pure functions — no DB — so these run everywhere, CI
// included. What they guard: a score reads as a NUMBER + a WORD exactly as in the app
// (apps/mobile/src/lib/score.ts), and the page is Redesign 2's frozen black + burgundy + cream in
// Instrument Serif with no italics anywhere.

describe('scoreWord', () => {
  test('thresholds match the app: 9+ / 8+ / 7+ / 5+ / else', () => {
    expect(scoreWord(96)).toBe('Imperdible')
    expect(scoreWord(90)).toBe('Imperdible')
    expect(scoreWord(89)).toBe('Excelente')
    expect(scoreWord(80)).toBe('Excelente')
    expect(scoreWord(79)).toBe('Bueno')
    expect(scoreWord(70)).toBe('Bueno')
    expect(scoreWord(69)).toBe('Normal')
    expect(scoreWord(50)).toBe('Normal')
    expect(scoreWord(49)).toBe('Sáltalo')
    expect(scoreWord(0)).toBe('Sáltalo')
  })

  test('reads the word off the number as DISPLAYED, so the two never disagree', () => {
    // 89.96 displays as "9.0" — it must be Imperdible, not Excelente.
    expect(displayScore(89.96)).toBe('9.0')
    expect(scoreWord(89.96)).toBe('Imperdible')
  })
})

describe('scoreChip', () => {
  test('is the figure and its word, escaped', () => {
    const html = scoreChip(82)
    expect(html).toContain('<span class="sn">8.2</span>')
    expect(html).toContain('<span class="sw">Excelente</span>')
  })
})

describe('layout', () => {
  const html = layout({
    title: 'Vesuvio en Mesa',
    description: 'Italiano · Bella Vista',
    image: null,
    canonical: 'https://example.test/p/r/1',
    body: '<h1>Vesuvio</h1>',
  })

  test('is the lowercase wordmark in Instrument Serif over the black + burgundy ground', () => {
    expect(html).toContain('<div class="mark">mesa</div>')
    expect(html).toContain('family=Instrument+Serif')
    expect(html).toContain('#0b0809')
    expect(html).toContain('#7a1a29')
    expect(html).toContain('#f4ede2')
  })

  test('no italics, and none of the retired brand', () => {
    expect(html).not.toContain('italic')
    expect(html).not.toContain('Cormorant')
    expect(html).not.toContain('Jakarta')
    expect(html).not.toContain('#c09050')
    expect(html).not.toContain('#210104')
  })

  test('the UI face is the system font, not a web font', () => {
    expect(html).toContain('-apple-system')
  })

  test('the not-found page uses the same shell', () => {
    const missing = notFound('https://example.test/p/x')
    expect(missing).toContain('<div class="mark">mesa</div>')
    expect(missing).toContain('No encontrado')
  })
})
