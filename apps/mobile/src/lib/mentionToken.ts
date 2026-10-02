// @mentions on the typing side and the reading side. Pure (no React Native), so it is unit-tested with the
// other lib/*.test.ts. The rules mirror the API's (apps/api/src/lib/mentions.ts): a handle is 2–30 characters
// of a–z, 0–9, "_" and "."; an "@" counts only where a word starts (not inside an email, not "@@"); a
// trailing dot is punctuation, not part of the handle.

const HANDLE_CHAR = /[a-z0-9_.]/i
const WORD_CHAR = /[\w.@]/ // what an "@" must NOT directly follow

// The "@word" being typed at the cursor: where it starts (at the "@"), where it ends (past any handle
// characters after the cursor, so completing "@en|rique" replaces the whole word), and what has been typed
// after the "@" up to the cursor.
export interface MentionToken {
  start: number
  end: number
  query: string
}

export function activeMention(text: string, cursor: number): MentionToken | null {
  const at = Math.min(Math.max(cursor, 0), text.length)
  let i = at
  while (i > 0 && HANDLE_CHAR.test(text[i - 1] ?? '')) i--
  if (i === 0 || text[i - 1] !== '@') return null
  const start = i - 1
  const before = text[start - 1]
  if (before !== undefined && WORD_CHAR.test(before)) return null
  let end = at
  while (end < text.length && HANDLE_CHAR.test(text[end] ?? '')) end++
  return { start, end, query: text.slice(start + 1, at).toLowerCase() }
}

// The text with the typed word replaced by "@handle " (one space after, unless one is already there), and
// where the cursor goes: right after it.
export function insertMention(
  text: string,
  token: MentionToken,
  handle: string,
): { text: string; cursor: number } {
  const after = text.slice(token.end)
  const spacer = after.startsWith(' ') ? '' : ' '
  const head = `${text.slice(0, token.start)}@${handle}${spacer}`
  return { text: head + after, cursor: head.length + (spacer === '' ? 1 : 0) }
}

// A piece of shown text: plain, or a handle (without its "@") to link.
export type MentionPart = { text: string } | { handle: string; raw: string }

// Splits a note, comment or caption into plain text and @handles, in order. Anything that is not a
// mention stays in the plain pieces exactly as written.
export function splitMentions(text: string): MentionPart[] {
  const parts: MentionPart[] = []
  let plain = 0
  for (const m of text.matchAll(/@([a-z0-9_.]{2,30})/gi)) {
    const at = m.index ?? 0
    const before = text[at - 1]
    if (before !== undefined && WORD_CHAR.test(before)) continue
    const handle = (m[1] ?? '').replace(/\.+$/, '')
    if (handle.length < 2) continue
    if (at > plain) parts.push({ text: text.slice(plain, at) })
    parts.push({ handle: handle.toLowerCase(), raw: `@${handle}` })
    plain = at + 1 + handle.length
  }
  if (plain < text.length) parts.push({ text: text.slice(plain) })
  return parts
}
