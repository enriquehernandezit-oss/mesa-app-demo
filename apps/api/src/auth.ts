import { db, schema } from '@mesa/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { genericOAuth, phoneNumber } from 'better-auth/plugins'

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

  // Email + password — a first-party account alongside phone/Apple/Instagram, so
  // membership never depends on owning a social identity. The hash lands in
  // account.password (providerId 'credential'); the user table already carries
  // email + emailVerified. Verification isn't required to sign in in this build
  // (no mail sender wired yet); the real profile is still gathered in onboarding.
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
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
