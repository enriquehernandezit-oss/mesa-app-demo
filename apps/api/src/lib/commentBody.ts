import { z } from 'zod'

// A ranking comment's text: one short line under a friend's post, same spirit
// as a vibe note. Trimmed before the length checks, so whitespace alone is
// empty and padding never counts against the cap. Pure (no db) so it's
// testable on its own.
export const COMMENT_MAX = 280

const commentSchema = z.object({ body: z.string().trim().min(1).max(COMMENT_MAX) })

// The trimmed body, or null when the request body is malformed, blank, or over
// the cap — the route answers all three with 400 invalid_body.
export function parseCommentBody(input: unknown): string | null {
  const parsed = commentSchema.safeParse(input)
  return parsed.success ? parsed.data.body : null
}
