import { db, schema } from '@mesa/db'

// Writing the auth audit trail. See packages/db/src/schema/auth.ts for why it
// exists and what it deliberately does NOT record.
const { authEvent } = schema

export type AuthEventType =
  | 'sign_in'
  | 'sign_in_failed'
  | 'sign_up'
  | 'password_reset'
  | 'password_changed'
  | 'sessions_revoked'

// Retention (90 days) is enforced where it can actually run on a schedule —
// packages/db/src/migrate.ts, which Railway executes on every deploy.

// Fire-and-forget. An audit write must never fail a sign-in: losing one row is
// bad, refusing a member entry because a log write failed is worse.
export function recordAuthEvent(input: {
  type: AuthEventType
  userId?: string | null
  ip?: string | null
  userAgent?: string | null
}): void {
  void db
    .insert(authEvent)
    .values({
      type: input.type,
      userId: input.userId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 400) ?? null,
    })
    .catch((err) => {
      console.error('[audit] failed to record', input.type, err)
    })
}
