// Santo Domingo sectors added after the first seven (migration 0040). One list, read by the seed and
// checked against the migration's SQL by sectors.test.ts, so a fresh `db:seed` and a migrated
// production database end up with the same sectors.
//
// Centroids are the average of the real places Google placed in each sector (the cached places:enrich
// answers), not guesses; a sector with a single place sits on that place. `aliases` are the other
// names Google or locals use, matched (accents and case ignored) when a place is filed — Google calls
// Naco "Ensanche Naco", Paraíso "Ensanche Paraíso".
//
// Not here yet, on purpose: Los Cacicazgos, Mirador Sur, Renacimiento, Miraflores — no verified
// coordinates yet. They arrive with their first real place (see places:refile's report).
export type SectorSeed = {
  slug: string
  name: string
  lat: number
  lng: number
  radiusM: number
  aliases: string[]
}

export const NEW_SECTORS: SectorSeed[] = [
  {
    slug: 'la-esperilla',
    name: 'La Esperilla',
    lat: 18.4681,
    lng: -69.9232,
    radiusM: 900,
    aliases: [],
  },
  {
    slug: 'ensanche-quisqueya',
    name: 'Ensanche Quisqueya',
    lat: 18.4674,
    lng: -69.9404,
    radiusM: 520,
    aliases: [],
  },
  {
    slug: 'paraiso',
    name: 'Paraíso',
    lat: 18.4797,
    lng: -69.9401,
    radiusM: 400,
    aliases: ['Ensanche Paraíso'],
  },
  {
    slug: 'julieta-morales',
    name: 'Julieta Morales',
    lat: 18.4748,
    lng: -69.947,
    radiusM: 490,
    aliases: [],
  },
  { slug: 'el-millon', name: 'El Millón', lat: 18.458, lng: -69.9568, radiusM: 470, aliases: [] },
  {
    slug: 'ciudad-universitaria',
    name: 'Ciudad Universitaria',
    lat: 18.4573,
    lng: -69.9165,
    radiusM: 950,
    aliases: ['Zona Universitaria'],
  },
  {
    slug: 'arroyo-hondo',
    name: 'Arroyo Hondo',
    lat: 18.4844,
    lng: -69.9355,
    radiusM: 400,
    aliases: ['Viejo Arroyo Hondo'],
  },
  { slug: 'la-julia', name: 'La Julia', lat: 18.4621, lng: -69.9305, radiusM: 400, aliases: [] },
  {
    slug: 'los-prados',
    name: 'Los Prados',
    lat: 18.4736,
    lng: -69.9565,
    radiusM: 400,
    aliases: [],
  },
  {
    slug: 'mirador-norte',
    name: 'Mirador Norte',
    lat: 18.4495,
    lng: -69.9584,
    radiusM: 400,
    aliases: [],
  },
  {
    slug: 'ensanche-la-fe',
    name: 'Ensanche La Fe',
    lat: 18.4863,
    lng: -69.9301,
    radiusM: 400,
    aliases: [],
  },
  {
    slug: 'ciudad-nueva',
    name: 'Ciudad Nueva',
    lat: 18.4665,
    lng: -69.8914,
    radiusM: 400,
    aliases: [],
  },
  {
    slug: 'los-jardines',
    name: 'Los Jardines',
    lat: 18.4831,
    lng: -69.9541,
    radiusM: 400,
    aliases: [],
  },
  {
    slug: 'los-restauradores',
    name: 'Los Restauradores',
    lat: 18.4595,
    lng: -69.9619,
    radiusM: 400,
    aliases: [],
  },
]

// The first seven's alternative names (Google's sublocality for them).
export const EXISTING_SECTOR_ALIASES: Record<string, string[]> = {
  naco: ['Ensanche Naco'],
}
