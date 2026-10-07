// When does an email + password sign-up or sign-in have to stop at the 6-digit code screen?
// Decided from what the server answered, not from a setting in the app: the server turns the
// requirement on (REQUIRE_EMAIL_VERIFICATION), so an older API or a switched-off flag still lets
// the member straight in.

export const EMAIL_CODE_LENGTH = 6

type AuthResult = { data?: { token?: string | null } | null; error?: { code?: string } | null }

export function needsEmailCode(mode: 'signup' | 'signin', res: AuthResult): boolean {
  // A new account that came back with no session is waiting for its address to be confirmed.
  if (mode === 'signup') return !res.error && !res.data?.token
  // A right password on an unconfirmed address: the server has just mailed a fresh code.
  return res.error?.code === 'EMAIL_NOT_VERIFIED'
}

// What the code field holds: digits only (iOS can paste "123 456" or a whole sentence), at most six.
export function codeDigits(text: string): string {
  return text.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH)
}
