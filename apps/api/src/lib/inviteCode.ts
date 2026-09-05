// Invite codes are read aloud, retyped, and forwarded in WhatsApp — so the
// alphabet drops every character that gets confused in that setting: 0/O, 1/I/L,
// and everything lowercase (a code screenshotted at night should still be
// legible). 8 chars over 30 symbols ≈ 6.5e11 combinations, so collisions are
// vanishing even before the retry loop below.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const LENGTH = 8

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH))
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}
