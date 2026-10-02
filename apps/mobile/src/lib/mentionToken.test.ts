import { describe, expect, test } from 'bun:test'

import { activeMention, insertMention, splitMentions } from './mentionToken'

describe('activeMention', () => {
  test('finds the word being typed after an @, up to the cursor', () => {
    expect(activeMention('hola @en', 8)).toEqual({ start: 5, end: 8, query: 'en' })
    expect(activeMention('@', 1)).toEqual({ start: 0, end: 1, query: '' })
    expect(activeMention('@Enr', 4)?.query).toBe('enr')
  })

  test('works in the middle: the word after the cursor is part of what gets replaced', () => {
    // cursor between "en" and "rique"
    expect(activeMention('con @enrique hoy', 7)).toEqual({ start: 4, end: 12, query: 'en' })
  })

  test('nothing to complete once the word is over, or when it is not a mention', () => {
    expect(activeMention('hola @ana ', 10)).toBeNull() // cursor after the space
    expect(activeMention('hola', 4)).toBeNull()
    expect(activeMention('ana@gmail', 9)).toBeNull() // an email
    expect(activeMention('@@ana', 5)).toBeNull()
    expect(activeMention('', 0)).toBeNull()
  })

  test('a cursor past the end is clamped', () => {
    expect(activeMention('@ab', 99)?.query).toBe('ab')
  })
})

describe('insertMention', () => {
  test('replaces the typed word with the handle and a space, cursor after it', () => {
    const token = activeMention('con @en', 7)!
    expect(insertMention('con @en', token, 'enriquehh')).toEqual({
      text: 'con @enriquehh ',
      cursor: 15,
    })
  })

  test('keeps the text after it, without doubling a space that is already there', () => {
    const token = activeMention('con @en hoy', 7)!
    expect(insertMention('con @en hoy', token, 'enrique')).toEqual({
      text: 'con @enrique hoy',
      cursor: 13,
    })
  })

  test('completing in the middle of a word replaces all of it', () => {
    const token = activeMention('con @enrique hoy', 8)!
    expect(insertMention('con @enrique hoy', token, 'enriquehh').text).toBe('con @enriquehh hoy')
  })
})

describe('splitMentions', () => {
  test('plain text and handles, in order, nothing lost', () => {
    const parts = splitMentions('cenamos con @Ana y @bo_2, qué rico')
    expect(parts).toEqual([
      { text: 'cenamos con ' },
      { handle: 'ana', raw: '@Ana' },
      { text: ' y ' },
      { handle: 'bo_2', raw: '@bo_2' },
      { text: ', qué rico' },
    ])
    // putting the pieces back gives the original
    expect(parts.map((p) => ('handle' in p ? p.raw : p.text)).join('')).toBe(
      'cenamos con @Ana y @bo_2, qué rico',
    )
  })

  test('a trailing dot stays punctuation; a dot inside a handle stays in it', () => {
    expect(splitMentions('gracias @ana.')).toEqual([
      { text: 'gracias ' },
      { handle: 'ana', raw: '@ana' },
      { text: '.' },
    ])
    expect(splitMentions('@ana.maria')).toEqual([{ handle: 'ana.maria', raw: '@ana.maria' }])
  })

  test('emails, doubled @ and lone @ are plain text', () => {
    expect(splitMentions('ana@gmail.com')).toEqual([{ text: 'ana@gmail.com' }])
    expect(splitMentions('@@ana')).toEqual([{ text: '@@ana' }])
    expect(splitMentions('a @ b')).toEqual([{ text: 'a @ b' }])
    expect(splitMentions('')).toEqual([])
  })
})
