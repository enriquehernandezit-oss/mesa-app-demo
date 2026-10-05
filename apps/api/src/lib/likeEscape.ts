import { type SQL, sql } from 'drizzle-orm'

// A search term, made safe to sit inside `ilike '%' || term || '%'`. In LIKE, `%` and `_` are
// wildcards and backslash is the escape, so a member typing "%%" or "__" matched every place and
// every member. Each is prefixed with a backslash instead. (mesa_norm lowercases and strips accents
// but leaves these alone.) Built from chr(92) rather than a '\' literal so no layer of string
// escaping can change what it means.
export function likeEscaped(term: SQL): SQL {
  return sql`replace(replace(replace(${term}, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_')`
}
