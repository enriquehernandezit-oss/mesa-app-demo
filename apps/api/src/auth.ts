import { db, schema } from '@mesa/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, genericOAuth, phoneNumber } from 'better-auth/plugins'

// Better Auth wired to Postgres via the pooled Drizzle client from @mesa/db.
//
// App Store 4.8: because Mesa offers Instagram login, Sign in with Apple must be
// offered alongside it with equal prominence. Both are wired here from the first
// auth commit. Each provider is env-gated so the API boots in dev without any
// secrets; phone auth always works via a dev OTP that logs the code to the
// console. Real credentials (Apple, Meta) turn the social providers on with no
// code change.
//
// Instagram is not a Better Auth built-in provider, so it goes through the
// generic-oauth plugin pointed at Meta's official OAuth endpoints (App Store 4.5
// — sanctioned OAuth, no scraping). Note: Instagram Basic Display is being
// retired by Meta; when you create the Meta app, set the endpoints/scopes for
// whichever Instagram Login flow Meta assigns you via the env vars below.

const hasApple = Boolean(process.env.APPLE_CLIENT_ID)
const hasInstagram = Boolean(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET)

// The app origin — where reset-password links land (a frontend page that
// collects the new password). First of APP_ORIGINS, same list CORS/trust use.
const appOrigin = (process.env.APP_ORIGINS ?? 'http://localhost:5173').split(',')[0]

// Transactional email (password reset + verification), sent through Resend — a
// plain HTTPS POST, no new dependency (same ethos as the hand-rolled Cloudinary
// signature). When EMAIL_PROVIDER_API_KEY is set the mail goes out for real;
// with no key, dev prints the link to the console (the exact mirror of the
// phone-OTP dev path) so the flows stay exercisable locally, while prod fails
// loud rather than silently dropping a security-critical link. Placeholder phone
// accounts (<digits>@phone.mesa.local) have no real inbox and are skipped.
const RESEND_KEY = process.env.EMAIL_PROVIDER_API_KEY
// The verified sender. Defaults to Resend's shared onboarding@resend.dev, which
// only delivers to the Resend account owner's own address — fine for a first
// test; set EMAIL_FROM to your verified domain address (e.g. "Mesa <mail@…>").
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Mesa <onboarding@resend.dev>'

// Best-effort transactional email. It NEVER throws: a mail-provider outage or an
// unset key must not 500 an auth flow. Verification-on-signup is not a gate
// (requireEmailVerification is false), and password reset returns the same
// generic response whether or not the mail goes out — so a thrown error would
// only break signup/reset and, on reset, leak which addresses exist (only a
// registered email triggers a send). Failures are logged as errors instead, so
// a misconfiguration is loud in the server logs — the "fail loud" the original
// design wanted, moved off the user-facing response.
async function sendMail(to: string, subject: string, body: string) {
  if (to.endsWith('@phone.mesa.local')) return
  try {
    if (!RESEND_KEY) {
      if (process.env.NODE_ENV === 'production') {
        console.error(
          `[email] NOT SENT to=${to} · ${subject} — EMAIL_PROVIDER_API_KEY unset in production`,
        )
      } else {
        console.log(`[dev email] to=${to} · ${subject}\n${body}\n`)
      }
      return
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, text: body }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(
        `[email] send failed (${res.status}) to=${to} · ${subject}: ${detail.slice(0, 300)}`,
      )
    }
  } catch (err) {
    console.error(`[email] send threw to=${to} · ${subject}:`, err)
  }
}

const instagramPlugin = genericOAuth({
  config: [
    {
      providerId: 'instagram',
      clientId: process.env.INSTAGRAM_CLIENT_ID ?? '',
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET ?? '',
      authorizationUrl:
        process.env.INSTAGRAM_AUTH_URL ?? 'https://api.instagram.com/oauth/authorize',
      tokenUrl: process.env.INSTAGRAM_TOKEN_URL ?? 'https://api.instagram.com/oauth/access_token',
      userInfoUrl:
        process.env.INSTAGRAM_USERINFO_URL ?? 'https://graph.instagram.com/me?fields=id,username',
      scopes: (process.env.INSTAGRAM_SCOPES ?? 'user_profile').split(','),
      // Instagram returns no email; seed the display name from the handle.
      mapProfileToUser: (profile: { username?: string }) => ({
        name: profile.username ?? '',
      }),
    },
  ],
})

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  // The app runs on a different origin than the API (Vite in dev, the web/native
  // build in prod), so sign-in POSTs come cross-origin. Trust the same origins
  // the CORS layer allows, or Better Auth rejects them as "Invalid origin".
  trustedOrigins: (process.env.APP_ORIGINS ?? 'http://localhost:5173').split(','),
  database: drizzleAdapter(db, { provider: 'pg', schema }),

  // Throttle the auth surface so sign-in / reset-request / sign-up flooding
  // (and, once wired, OTP brute-force) is bounded — and so cheap unverified
  // account creation can't be used to amplify calls against the paid Google
  // proxy. Better Auth's built-in limiter; enabled in all environments here
  // (its default only runs in production).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },

  // Cookies keep Better Auth's default SameSite=Lax. Cross-site clients (the
  // deployed web app on a different subdomain, iOS Safari, the Capacitor native
  // shell) authenticate via the Bearer token below — a header the browser never
  // auto-attaches — so the session cookie has no cross-site job to do. Keeping
  // it Lax means it's never sent on a cross-site request, closing the CSRF
  // surface that SameSite=None would open on our own state-changing routes.

  // Email + password — a first-party account alongside phone/Apple/Instagram, so
  // membership never depends on owning a social identity. The hash lands in
  // account.password (providerId 'credential'); the user table already carries
  // email + emailVerified. Verification isn't required to sign in in this build
  // (no mail sender wired yet); the real profile is still gathered in onboarding.
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
    // Forgot-password: the emailed link points at the app's /reset-password page
    // carrying the one-time token; that page collects the new password and calls
    // resetPassword({ newPassword, token }).
    sendResetPassword: async ({ user, token }) => {
      const url = `${appOrigin}/reset-password?token=${token}`
      await sendMail(
        user.email,
        'Reset your Mesa password',
        `Someone requested a password reset for your Mesa account.

Choose a new password here:
${url}

This link expires in about an hour. If you didn't request it, you can safely ignore this email.`,
      )
    },
  },

  // Email verification. A link is sent on email/password signup (skipped for
  // placeholder phone accounts inside sendMail); clicking it hits Better Auth's
  // verify endpoint and signs the user in. Not required to use the app in this
  // build (requireEmailVerification:false) — it confirms the address, no gate.
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(
        user.email,
        'Verify your email for Mesa',
        `Welcome to Mesa. Confirm your email to finish setting up your account:
${url}

If you didn't create a Mesa account, you can ignore this email.`,
      )
    },
  },

  // Surface Mesa's server-managed profile/moderation columns on the session user
  // so route handlers and middleware can read them (e.g. the ban gate and the
  // moderator check) without an extra query. input:false — clients can't set
  // these through auth endpoints; they're written by our own routes/moderation.
  user: {
    additionalFields: {
      handle: { type: 'string', required: false, input: false },
      neighborhoodId: { type: 'string', required: false, input: false },
      bannedAt: { type: 'date', required: false, input: false },
      isModerator: { type: 'boolean', required: false, input: false },
    },
  },

  // Sign in with Apple — the App Store 4.8 counterpart to Instagram login.
  socialProviders: hasApple
    ? {
        apple: {
          clientId: process.env.APPLE_CLIENT_ID ?? '',
          clientSecret: process.env.APPLE_CLIENT_SECRET ?? '',
          appBundleIdentifier: process.env.APPLE_APP_BUNDLE_ID,
        },
      }
    : undefined,

  plugins: [
    // Bearer-token auth alongside cookies. On sign-in the server returns the
    // session token in a `set-auth-token` response header; the client stores it
    // and sends `Authorization: Bearer <token>` on every request. This is the
    // auth path that survives where cross-site cookies don't — iOS Safari's
    // tracking prevention and the Capacitor native webview. Cookies still work
    // untouched for first-party/same-origin web.
    bearer(),
    phoneNumber({
      sendOTP: async ({ phoneNumber: to, code }) => {
        // Dev path: no SMS provider needed to exercise phone login locally.
        // M2 swaps this for the real SMS sender.
        if (process.env.NODE_ENV === 'production') {
          throw new Error('SMS provider not configured (set SMS_PROVIDER_API_KEY)')
        }
        console.log(`[dev sms] OTP for ${to}: ${code}`)
      },
      // First verification of a new number creates the account. Phone users have
      // no real email, so we mint a stable placeholder; onboarding (M2) collects
      // the real profile (handle, neighborhood, name).
      signUpOnVerification: {
        getTempEmail: (phone) => `${phone.replace(/[^\d]/g, '')}@phone.mesa.local`,
        getTempName: (phone) => phone,
      },
    }),
    ...(hasInstagram ? [instagramPlugin] : []),
  ],
})

export type Auth = typeof auth
