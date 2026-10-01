// The "where" under a place's name: its neighborhood and its city, each once. A Santo Domingo place
// reads "Piantini, Santo Domingo"; a place filed under its own city (Punta Cana, Miami Beach) already
// IS the city, and "Punta Cana, Punta Cana" would only look like a bug.
export function placeWhere(
  hood: string | null | undefined,
  city: string | null | undefined,
): string {
  return [...new Set([hood, city].filter((v): v is string => Boolean(v)))].join(', ')
}
