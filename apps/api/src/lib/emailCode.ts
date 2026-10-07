import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'

// The 6-digit code that proves an email address belongs to the person who signed up with it
// (Better Auth's emailOTP plugin, wired in auth.ts). Apple and Google already vouch for their
// addresses; an email + password account is the one kind Mesa has to check itself.

export const EMAIL_CODE_LENGTH = 6
export const EMAIL_CODE_MINUTES = 10
// Wrong guesses allowed on one code before it is spent and a new one has to be asked for. With six
// digits that is a 3-in-a-million chance per code, and every new code lands in the real inbox.
export const EMAIL_CODE_ATTEMPTS = 3

// Plain text, Spanish first like the app, the code on its own line so iOS can offer it above the
// keyboard. The subject carries the code too: it is what shows in the notification.
export function emailCodeMail(code: string): { subject: string; body: string } {
  return {
    subject: `${code} es tu código de Mesa`,
    body: `Tu código para confirmar tu correo en Mesa:

${code}

Vence en ${EMAIL_CODE_MINUTES} minutos. Si no creaste una cuenta en Mesa, ignora este correo.

—

Your Mesa code to confirm your email: ${code}
It expires in ${EMAIL_CODE_MINUTES} minutes. If you didn't create a Mesa account, ignore this email.`,
  }
}

// A code is only for an address that isn't confirmed yet. Verifying a code also signs the member in
// (that is how someone stopped at sign-in gets in once they confirm), so without this anyone could
// ask for a code for a confirmed account and use it as a password-free way in. The answer is the
// same "sent" either way, so it reveals nothing about which addresses are confirmed or exist.
const SEND_PATH = '/email-otp/send-verification-otp'

export const emailCodeGuard = {
  id: 'mesa-email-code-guard',
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === SEND_PATH,
        handler: createAuthMiddleware(async (ctx) => {
          const body = ctx.body as { email?: unknown; type?: unknown } | null
          if (body?.type !== 'email-verification' || typeof body.email !== 'string') return
          const found = await ctx.context.internalAdapter.findUserByEmail(body.email.toLowerCase())
          if (found?.user.emailVerified) return ctx.json({ success: true })
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin
