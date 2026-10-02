// @mentions: pulling the handles out of a note, a comment or a dish caption. Pure (no database), so the
// rules are unit-tested; lib/mentionNotify.ts turns the handles into people and notifications.
//
// A handle is what the app already allows (routes/me.ts): 2–30 characters of a–z, 0–9, "_" and ".".
// A mention is an "@" that STARTS a word — not the "@" inside "ana@gmail.com" or "@@ana" — followed by
// a handle. People type capitals and end sentences with a dot ("thanks @Ana."), so the match is
// case-insensitive and trailing dots are not part of the handle.

// More than this in one text is spam, not conversation: the rest are ignored.
export const MAX_MENTIONS = 5

const MENTION = /(?<![\w.@])@([a-z0-9_.]{2,30})/gi

// The distinct handles mentioned, lowercased, in the order they first appear, at most MAX_MENTIONS.
export function extractHandles(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(MENTION)) {
    const handle = (m[1] ?? '').replace(/\.+$/, '').toLowerCase()
    if (handle.length < 2 || found.includes(handle)) continue
    found.push(handle)
    if (found.length === MAX_MENTIONS) break
  }
  return found
}

// What the app's @-autocomplete sends: the part of a handle typed so far (no "@"), or null when it is
// not a handle prefix at all. Empty is fine — it asks for the people you follow.
const PREFIX = /^[a-z0-9_.]{0,30}$/
export function parseHandlePrefix(raw: string | undefined): string | null {
  const q = (raw ?? '').trim().replace(/^@/, '').toLowerCase()
  return PREFIX.test(q) ? q : null
}
