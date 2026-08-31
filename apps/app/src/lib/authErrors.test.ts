import { describe, expect, test } from 'bun:test'
import { authErrorEs } from './authErrors'

// The point of this map is that no English ever reaches a Spanish screen. These
// pin the fallback behaviour, since a miss is silent by nature — it renders a
// plausible sentence either way.

describe('authErrorEs', () => {
  test('translates a known code', () => {
    expect(authErrorEs({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      'El correo o la contraseña no coinciden.',
    )
  })

  test('prefers the code over a status when both are present', () => {
    expect(authErrorEs({ code: 'OTP_EXPIRED', status: 500 })).toBe(
      'El código venció. Pide uno nuevo.',
    )
  })

  test('falls back to the status when the code is unknown', () => {
    expect(authErrorEs({ code: 'SOMETHING_NEW', status: 429 })).toBe(
      'Demasiados intentos. Espera un momento e intenta de nuevo.',
    )
  })

  test('never returns the library’s English message', () => {
    const english = 'User already exists. Use another email.'
    expect(authErrorEs({ message: english })).not.toContain(english)
  })

  test('explains a breached password instead of a generic failure', () => {
    expect(authErrorEs({ code: 'PASSWORD_COMPROMISED' }, 'No se pudo crear la cuenta.')).toContain(
      'filtración',
    )
  })

  test('handles a null or undefined error', () => {
    expect(authErrorEs(null)).toBe('Algo salió mal. Intenta de nuevo.')
    expect(authErrorEs(undefined)).toBe('Algo salió mal. Intenta de nuevo.')
  })

  test('honours a caller-supplied fallback', () => {
    expect(authErrorEs({ code: 'UNKNOWN' }, 'No se pudo crear la cuenta.')).toBe(
      'No se pudo crear la cuenta.',
    )
  })
})
