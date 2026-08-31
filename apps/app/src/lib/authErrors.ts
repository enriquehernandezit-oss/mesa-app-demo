// Better Auth's errors in Spanish.
//
// Keyed on the stable `code`, never the message: the messages are English prose
// written by the library, and they were being rendered raw on a Spanish screen.
// Codes are part of its API and survive wording changes; an unmapped one falls
// back to a plain sentence rather than leaking English.
//
// Codes verified against better-auth 1.6.25 (@better-auth/core error/codes and
// the phone-number plugin) — not guessed.

const ES: Record<string, string> = {
  // Sign in / sign up
  INVALID_EMAIL_OR_PASSWORD: 'El correo o la contraseña no coinciden.',
  INVALID_EMAIL: 'Ese correo no parece válido.',
  INVALID_PASSWORD: 'La contraseña no es correcta.',
  USER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Ya existe una cuenta con ese correo.',
  USER_NOT_FOUND: 'No encontramos esa cuenta.',
  USER_EMAIL_NOT_FOUND: 'No encontramos esa cuenta.',
  PASSWORD_TOO_SHORT: 'La contraseña debe tener al menos 8 caracteres.',
  PASSWORD_TOO_LONG: 'Esa contraseña es demasiado larga.',
  EMAIL_NOT_VERIFIED: 'Confirma tu correo antes de entrar. Te enviamos un enlace.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'Esa cuenta entra con Apple o Instagram, no con contraseña.',

  // Session
  SESSION_EXPIRED: 'Tu sesión venció. Entra de nuevo.',
  SESSION_NOT_FRESH: 'Por seguridad, vuelve a entrar para hacer este cambio.',

  // Reset / verification links
  INVALID_TOKEN: 'Ese enlace ya no sirve. Pide uno nuevo.',
  TOKEN_EXPIRED: 'Ese enlace venció. Pide uno nuevo.',
  EMAIL_ALREADY_VERIFIED: 'Tu correo ya estaba confirmado.',

  // Providers
  PROVIDER_NOT_FOUND: 'Ese método de inicio de sesión aún no está disponible.',
  SOCIAL_ACCOUNT_ALREADY_LINKED: 'Esa cuenta ya está conectada a otro perfil.',
  ACCOUNT_NOT_FOUND: 'No encontramos esa cuenta.',

  // Phone OTP
  INVALID_OTP: 'Ese código no coincide.',
  OTP_EXPIRED: 'El código venció. Pide uno nuevo.',
  OTP_NOT_FOUND: 'Pide un código nuevo.',
  TOO_MANY_ATTEMPTS: 'Demasiados intentos. Espera un momento.',
  INVALID_PHONE_NUMBER: 'Ese número no parece válido.',
  PHONE_NUMBER_EXIST: 'Ya hay una cuenta con ese número.',
}

// HTTP statuses worth naming on their own, when there is no code to key on.
// 429 is the one members will actually meet: the auth surface is rate limited
// per IP and per account (apps/api/src/lib/authThrottle.ts).
const BY_STATUS: Record<number, string> = {
  429: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
  500: 'Algo falló de nuestro lado. Intenta de nuevo.',
  502: 'No pudimos conectar. Intenta de nuevo.',
  503: 'No pudimos conectar. Intenta de nuevo.',
}

// Better Auth's client returns { error: { code?, message?, status? } } rather
// than throwing, so callers pass that object straight in.
export function authErrorEs(
  error: { code?: string; message?: string; status?: number } | null | undefined,
  fallback = 'Algo salió mal. Intenta de nuevo.',
): string {
  if (!error) return fallback
  const byCode = error.code ? ES[error.code] : undefined
  if (byCode) return byCode
  const byStatus = error.status ? BY_STATUS[error.status] : undefined
  if (byStatus) return byStatus
  return fallback
}
