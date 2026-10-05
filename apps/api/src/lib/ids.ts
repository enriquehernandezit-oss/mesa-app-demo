import { z } from 'zod'

// A route parameter that must be a uuid. Without this check a malformed id reaches Postgres as an
// invalid uuid cast and surfaces as a 500 (and an error-tracker event) instead of a plain 404 —
// including on the public share pages, where a link mangled by a chat app ("…/spot/<id>)") is the
// everyday case.
const uuid = z.string().uuid()
export const isUuid = (id: string): boolean => uuid.safeParse(id).success
