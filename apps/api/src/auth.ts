import { db, schema } from '@mesa/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, emailOTP, genericOAuth, haveIBeenPwned, phoneNumber } from 'better-auth/plugins'

import { PWNED_MESSAGE } from './lib/authMessages'
import { authThrottleAfter, authThrottleBefore } from './lib/authThrottle'
import {
  EMAIL_CODE_ATTEMPTS,
  EMAIL_CODE_LENGTH,
  EMAIL_CODE_MINUTES,
  emailCodeGuard,
  emailCodeMail,
  existingAccountMail,
  shouldSendExistingNotice,
} from './lib/emailCode'
import { resetPasswordUrl } from './lib/publicPage'

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

// Dev-only conveniences — printing reset links and OTP codes to the console —
// must require an EXPLICITLY development environment. This used to test
// `NODE_ENV === 'production'` and treat everything else as development, so an
// UNSET NODE_ENV (the default on Railway) silently printed password-reset links
// and OTP codes into the production logs, where anyone with log access could
// use them. Unknown environments now get the safe behaviour, not the chatty one.
//
// The boot guard below deliberately keeps the narrower `=== 'production'` test:
// withholding a debug log costs nothing, but refusing to start is expensive
// enough that it should only happen when the environment says so outright.
const isDevEnv = ['development', 'dev', 'test'].includes(process.env.NODE_ENV ?? '')

// Phone sign-in needs a way to deliver the code, and the code has no SMS sender yet: sendOTP below
// can only log it, which is a development convenience and nothing a member could use. So the routes
// are on in development only. Setting SMS_PROVIDER_API_KEY does NOT turn them on — it used to, and
// every send then threw, so a "working" phone login failed for the one person who tried it. When a
// sender is written, this is the one line to change (and docs/DEPLOY.md's phone note with it).
const hasSms = isDevEnv

// Must an email + password account confirm its address (the 6-digit code) before it can sign in?
// Off until the app that can enter the code is out: switched on with the code screen missing, a new
// member signs up and is simply never let in. Turned on from Railway, no deploy of code needed.
const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true'

const hasApple = Boolean(process.env.APPLE_CLIENT_ID)
// Both GOOGLE_CLIENT_ID (the Web client, paired with the secret) and
// GOOGLE_CLIENT_ID_IOS (the native app's client, no secret) are accepted as
// token audiences below — only the Web pair gates the provider, since the
// iOS app's native sign-in never needs the secret.
const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
const hasInstagram = Boolean(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET)

// Transactional email (password reset + verification), sent through Resend — a
// plain HTTPS POST, no new dependency (same ethos as R2 uploads using Bun's
// built-in S3Client instead of an SDK). When EMAIL_PROVIDER_API_KEY is set the mail goes out for real;
// with no key, dev prints the link to the console (the exact mirror of the
// phone-OTP dev path) so the flows stay exercisable locally, while prod fails
// loud rather than silently dropping a security-critical link. Placeholder phone
// accounts (<digits>@phone.mesa.local) have no real inbox and are skipped.
const RESEND_KEY = process.env.EMAIL_PROVIDER_API_KEY
// The verified sender. NO fallback on purpose. It used to default to Resend's
// shared onboarding@resend.dev, which Resend accepts but delivers ONLY to the
// Resend account owner — so in production every other member's password reset
// was accepted, logged as sent, and silently went nowhere. A default that works
// for exactly one inbox is worse than no default, because nothing looks broken.
const EMAIL_FROM = process.env.EMAIL_FROM

// Password reset is the only way back into an account, so in production a
// missing mail configuration is a startup failure rather than a per-send log
// line. Failing here means a bad deploy is rejected while the previous one
// keeps serving; the alternative is an API that looks healthy and quietly
// strands anyone who forgets their password. Dev is untouched: with no key the
// links print to the console, which is how the flows stay exercisable locally.
if (process.env.NODE_ENV === 'production') {
  const missing = [!RESEND_KEY && 'EMAIL_PROVIDER_API_KEY', !EMAIL_FROM && 'EMAIL_FROM'].filter(
    Boolean,
  )
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start: ${missing.join(' and ')} must be set in production — without them password reset and email verification silently fail. EMAIL_FROM must be an address on a domain verified in Resend.`,
    )
  }
}

// Best-effort transactional email. It NEVER throws: a mail-provider outage or an
// unset key must not 500 an auth flow. Verification-on-signup is not a gate
// (requireEmailVerification is false), and password reset returns the same
// generic response whether or not the mail goes out — so a thrown error would
// only break signup/reset and, on reset, leak which addresses exist (only a
// registered email triggers a send). Failures are logged as errors instead, so
// a misconfiguration is loud in the server logs — the "fail loud" the original
// design wanted, moved off the user-facing response.
export async function sendMail(to: string, subject: string, body: string) {
  if (to.endsWith('@phone.mesa.local')) return
  try {
    if (!RESEND_KEY) {
      if (!isDevEnv) {
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
      return
    }
    // Log the provider's id on success too, so "I never got the email" can be
    // traced to a specific message in the Resend dashboard instead of guessed at.
    const sent = (await res.json().catch(() => null)) as { id?: string } | null
    console.log(`[email] sent to=${to} · ${subject} · id=${sent?.id ?? 'unknown'}`)
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

// The emailOTP plugin's other routes: password-free sign-in by code, its own password reset and
// email change. Mesa has one reset (the emailed link) and confirmation is the only job the code does,
// so these stay closed — including the "is this code right?" check, which would only be a free guess.
const EMAIL_OTP_UNUSED = [
  '/email-otp/check-verification-otp',
  '/sign-in/email-otp',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/email-otp/reset-password',
  '/email-otp/request-email-change',
  '/email-otp/change-email',
]

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
  //
  // storage:'database' because the default is process memory, and this API
  // redeploys on every push — an in-memory limiter forgets every counter each
  // time, so a window never really holds. It reuses the pooled Drizzle client
  // (no Redis, no extra service) and prunes its own expired rows.
  //
  // The window/max here is only the fallback. Better Auth applies stricter
  // built-in rules to /sign-in*, /sign-up*, /change-password* and /change-email*
  // (3 per 10s) and to the reset/verification senders (3 per 60s). The rules
  // below exist for the paths those defaults DON'T cover — notably the phone
  // OTP endpoints, which would otherwise inherit this 20/minute fallback and
  // let one caller trigger 20 paid SMS a minute.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    storage: 'database',
    customRules: {
      '/phone-number/send-otp': { window: 600, max: 5 },
      '/phone-number/verify': { window: 600, max: 10 },
    },
  },

  // Which header carries the real client IP. This is load-bearing: the limiter
  // keys every counter on the IP alone, and Better Auth derives it by reading
  // ONE header and discarding the value unless it holds exactly one address.
  //
  // Measured against the deployment (not assumed): Railway sets
  // x-forwarded-for to "<client>, <edge>" — always TWO values, even on a
  // completely ordinary request — so the derived IP was always null and every
  // auth request in production shared a single bucket. Combined with the
  // built-in 3-per-10s sign-in rule, that meant three sign-in attempts from
  // anyone on earth locked sign-in for everyone (confirmed live: attempts 1-3
  // returned 401, attempts 4-6 returned 429).
  //
  // x-real-ip carries the true client address and is overwritten by the proxy —
  // a request forging it still arrived with the real value — so it is safe to
  // trust here in a way a client-supplied header would not be.
  advanced: {
    ipAddress: {
      ipAddressHeaders: ['x-real-ip'],
    },
  },

  // Sessions last a month rather than the 7-day default. This is a phone app
  // people open when they're going out, not every day, and the client caches
  // the session for five minutes — at 7 days a weekly-active member gets
  // silently bounced to the sign-in screen with no explanation. The exposure
  // that lengthens with it is a stolen bearer token, which is addressed where
  // it actually lives: the client now drops a dead token on a 401 (lib/api.ts),
  // a password reset revokes every other session (above), and updateAge and
  // freshAge keep Better Auth's 1-day defaults, so destructive operations still
  // demand a recently-authenticated session.
  session: {
    expiresIn: 60 * 60 * 24 * 30,
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
    // With it on, sign-up returns no session and sign-in with the right password answers
    // EMAIL_NOT_VERIFIED (403) and emails a fresh code; entering it signs the member in.
    requireEmailVerification,
    // Sign-up with an address that already has an account answers like any new sign-up, so the person
    // is told by email instead (lib/emailCode.ts). Not awaited: the answer must take as long as a
    // new sign-up's, or its timing gives the account away.
    onExistingUserSignUp: async ({ user }) => {
      if (!shouldSendExistingNotice(user.email)) return
      const mail = existingAccountMail()
      void sendMail(user.email, mail.subject, mail.body)
    },
    // Defaults to FALSE, which quietly defeats the point of a reset: someone
    // who resets because their account was compromised would leave the
    // attacker's session alive. Resetting a password must end every other
    // session.
    revokeSessionsOnPasswordReset: true,
    // Forgot-password: the emailed link points at THIS server's own
    // /p/reset-password page carrying the one-time token; that page collects the
    // new password and posts back (routes/auth-pages.ts). It used to point at
    // the Vite web app, which is retired — a link there is now a dead end.
    sendResetPassword: async ({ user, token }) => {
      const url = resetPasswordUrl(token)
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

  // Email verification is a 6-digit code (the emailOTP plugin below takes over sending it), mailed on
  // email + password sign-up and again on any sign-in while the address is unconfirmed. Entering it
  // confirms the address and signs the member in — needed when sign-up handed out no session.
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },

  // Per-account sign-in throttling. The IP limit above bounds one noisy source;
  // this bounds guessing against one ACCOUNT, which is what credential stuffing
  // actually does — it rotates IPs, so an IP bucket never sees it. See
  // lib/authThrottle.
  hooks: {
    before: authThrottleBefore,
    after: authThrottleAfter,
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
      // Read by requireEula: terms accepted, or not yet.
      eulaAcceptedAt: { type: 'date', required: false, input: false },
    },
  },

  // Account linking: if someone registered with email+password using their
  // Gmail address and later signs in with Google, that sign-in must NOT
  // silently take over the account unless the password account's own email is
  // already verified — otherwise anyone who knows a target's Gmail address
  // could "sign in with Google" and land inside their unverified Mesa account.
  // requireLocalEmailVerified is already Better Auth's default (see
  // oauth2/link-account.ts: `accountLinking?.requireLocalEmailVerified ?? true`),
  // so this doesn't change behavior — it's set explicitly so the policy stays
  // true on purpose and can't quietly flip if a future upgrade changes the
  // default. It applies to both Google and Apple; Apple's shipped without an
  // email-password account existing yet, so this is the first provider it
  // actually gates.
  account: {
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: true,
    },
  },

  // Sign in with Apple (App Store 4.8, required because Instagram login
  // exists) and Google — offered with equal prominence. A composed object
  // rather than the old `hasApple ? {...} : undefined` ternary, since a
  // second provider needs its own independent gate rather than riding on
  // Apple's.
  socialProviders: {
    ...(hasApple
      ? {
          apple: {
            clientId: process.env.APPLE_CLIENT_ID ?? '',
            clientSecret: process.env.APPLE_CLIENT_SECRET ?? '',
            appBundleIdentifier: process.env.APPLE_APP_BUNDLE_ID,
          },
        }
      : {}),
    ...(hasGoogle
      ? {
          google: {
            // Accept a token minted for either client as a valid audience: the
            // Web client (GOOGLE_CLIENT_ID, paired with the secret below, used
            // if a redirect-based flow is ever added) and the iOS client the
            // native SDK requests tokens for (GOOGLE_CLIENT_ID_IOS, no secret —
            // native apps can't hold one). The mobile app only ever does the
            // native idToken sign-in, so only the iOS audience is exercised
            // today, but the Web pair is what gates the provider being on at
            // all (an iOS client id alone can't do a server-side exchange).
            clientId: [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_ID_IOS].filter(
              (id): id is string => Boolean(id),
            ),
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
          },
        }
      : {}),
  },

  // Phone sign-in is off outside development until an SMS sender exists. disabledPaths keeps the
  // plugin, its schema and the client wiring intact, so turning it on is one line, not a revert.
  disabledPaths: hasSms
    ? [...EMAIL_OTP_UNUSED]
    : [
        '/phone-number/send-otp',
        '/phone-number/verify',
        '/phone-number/request-password-reset',
        '/phone-number/reset-password',
        ...EMAIL_OTP_UNUSED,
      ],

  plugins: [
    // Refuses passwords found in known breach corpora, checked by k-anonymity —
    // only a 5-character hash prefix leaves the server, never the password.
    // Credential stuffing against reused passwords is the likeliest real attack
    // on a small consumer app, and an 8-character minimum does nothing against
    // it. Zero new dependencies.
    haveIBeenPwned({
      customPasswordCompromisedMessage: PWNED_MESSAGE,
    }),
    // Bearer-token auth alongside cookies. On sign-in the server returns the
    // session token in a `set-auth-token` response header; the client stores it
    // and sends `Authorization: Bearer <token>` on every request. This is the
    // auth path that survives where cross-site cookies don't — iOS Safari's
    // tracking prevention and the Capacitor native webview. Cookies still work
    // untouched for first-party/same-origin web.
    bearer(),
    // Email confirmation by code. Codes are stored hashed and expire; the guard stops a code being
    // sent for an address that is already confirmed (lib/emailCode.ts).
    emailOTP({
      otpLength: EMAIL_CODE_LENGTH,
      expiresIn: EMAIL_CODE_MINUTES * 60,
      allowedAttempts: EMAIL_CODE_ATTEMPTS,
      storeOTP: 'hashed',
      overrideDefaultEmailVerification: true,
      // The plugin can also sign people up and in by code alone; Mesa uses it for confirmation only.
      disableSignUp: true,
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== 'email-verification') return
        const mail = emailCodeMail(otp)
        await sendMail(email, mail.subject, mail.body)
      },
    }),
    emailCodeGuard,
    phoneNumber({
      sendOTP: async ({ phoneNumber: to, code }) => {
        // Dev path: no SMS provider needed to exercise phone login locally.
        // Never outside an explicitly development environment — an OTP in a
        // deployment's logs is a credential sitting in plain text.
        if (!isDevEnv) {
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
