import { describe, expect, test } from 'bun:test'

import { splitTemplate } from './richText'

describe('splitTemplate', () => {
  test('splits text and tokens in order', () => {
    expect(splitTemplate('{name} cheered your ranking of {place}')).toEqual([
      { token: 'name' },
      { text: ' cheered your ranking of ' },
      { token: 'place' },
    ])
  })

  test('keeps text before the first token and after the last', () => {
    expect(splitTemplate('Has comido {label} en 4 lugares.')).toEqual([
      { text: 'Has comido ' },
      { token: 'label' },
      { text: ' en 4 lugares.' },
    ])
  })

  test('a template with no tokens is one text part, and an empty one is none', () => {
    expect(splitTemplate('Hola')).toEqual([{ text: 'Hola' }])
    expect(splitTemplate('')).toEqual([])
  })

  test('adjacent tokens produce no empty text between them', () => {
    expect(splitTemplate('{a}{b}')).toEqual([{ token: 'a' }, { token: 'b' }])
  })
})
