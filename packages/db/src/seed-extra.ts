// The 10x layer on top of the curated seed: more neighborhoods, more real
// Santo Domingo restaurants, and a deterministic generator for ~32 additional
// users with rankings, notes, tags, dishes, follows, saved places, and cheers.
// Everything derives from a fixed PRNG seed, so every reseed is identical.

import type { RestaurantSeed } from './seed-data'

// Deterministic PRNG (mulberry32) — same output every run.
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const extraNeighborhoods = [
  { slug: 'gazcue', name: 'Gazcue' },
  { slug: 'evaristo-morales', name: 'Evaristo Morales' },
]

export type RestaurantSeedX = RestaurantSeed & { priceTier: number }

// 34 more real Santo Domingo spots (approximate coordinates). isDemo-flagged
// like the rest; real numbers/photos replace these at launch.
export const extraRestaurants: RestaurantSeedX[] = [
  {
    key: 'sbg',
    name: 'SBG',
    neighborhood: 'piantini',
    cuisine: 'Contemporary',
    lat: 18.469,
    lng: -69.939,
    priceTier: 4,
  },
  {
    key: 'cassina',
    name: 'La Cassina',
    neighborhood: 'piantini',
    cuisine: 'Italian',
    lat: 18.4702,
    lng: -69.9371,
    priceTier: 3,
  },
  {
    key: 'locanda',
    name: 'La Locanda',
    neighborhood: 'piantini',
    cuisine: 'Italian',
    lat: 18.4668,
    lng: -69.9402,
    priceTier: 3,
  },
  {
    key: 'julieta',
    name: 'Julieta Brasserie',
    neighborhood: 'piantini',
    cuisine: 'Brasserie',
    lat: 18.4711,
    lng: -69.9356,
    priceTier: 4,
  },
  {
    key: 'dolcerie',
    name: 'La Dolcerie',
    neighborhood: 'piantini',
    cuisine: 'Brunch',
    lat: 18.4658,
    lng: -69.9378,
    priceTier: 2,
  },
  {
    key: 'agave',
    name: 'El Agave',
    neighborhood: 'piantini',
    cuisine: 'Mexican',
    lat: 18.468,
    lng: -69.9412,
    priceTier: 2,
  },
  {
    key: 'laurel',
    name: 'Laurel',
    neighborhood: 'piantini',
    cuisine: 'Wine Bar',
    lat: 18.4695,
    lng: -69.9345,
    priceTier: 3,
  },
  {
    key: 'fellini',
    name: 'Fellini',
    neighborhood: 'naco',
    cuisine: 'Italian',
    lat: 18.4741,
    lng: -69.9302,
    priceTier: 3,
  },
  {
    key: 'marocha',
    name: 'Marocha',
    neighborhood: 'evaristo-morales',
    cuisine: 'Fusion',
    lat: 18.4712,
    lng: -69.9485,
    priceTier: 2,
  },
  {
    key: 'chefpepper',
    name: 'Chef Pepper',
    neighborhood: 'evaristo-morales',
    cuisine: 'Grill',
    lat: 18.4728,
    lng: -69.9502,
    priceTier: 2,
  },
  {
    key: 'samurai',
    name: 'Samurai',
    neighborhood: 'gazcue',
    cuisine: 'Japanese',
    lat: 18.4645,
    lng: -69.9128,
    priceTier: 2,
  },
  {
    key: 'conuco',
    name: 'El Conuco',
    neighborhood: 'gazcue',
    cuisine: 'Dominican',
    lat: 18.4662,
    lng: -69.9101,
    priceTier: 2,
  },
  {
    key: 'payan',
    name: 'Barra Payán',
    neighborhood: 'gazcue',
    cuisine: 'Sandwiches',
    lat: 18.4699,
    lng: -69.9078,
    priceTier: 1,
  },
  {
    key: 'villar',
    name: 'Villar Hermanos',
    neighborhood: 'gazcue',
    cuisine: 'Dominican',
    lat: 18.4672,
    lng: -69.9145,
    priceTier: 1,
  },
  {
    key: 'cantabrico',
    name: 'Cantábrico',
    neighborhood: 'gazcue',
    cuisine: 'Spanish',
    lat: 18.4655,
    lng: -69.9092,
    priceTier: 3,
  },
  {
    key: 'bucheperico',
    name: "Buche' Perico",
    neighborhood: 'zona-colonial',
    cuisine: 'Dominican',
    lat: 18.4741,
    lng: -69.8865,
    priceTier: 3,
  },
  {
    key: 'mamey',
    name: 'Mamey',
    neighborhood: 'zona-colonial',
    cuisine: 'Café',
    lat: 18.4738,
    lng: -69.8832,
    priceTier: 2,
  },
  {
    key: 'alpargateria',
    name: 'La Alpargatería',
    neighborhood: 'zona-colonial',
    cuisine: 'Spanish',
    lat: 18.4729,
    lng: -69.8858,
    priceTier: 2,
  },
  {
    key: 'puratasca',
    name: 'Pura Tasca',
    neighborhood: 'zona-colonial',
    cuisine: 'Tapas',
    lat: 18.4718,
    lng: -69.8871,
    priceTier: 2,
  },
  {
    key: 'pizzarelli',
    name: 'Pizzarelli',
    neighborhood: 'bella-vista',
    cuisine: 'Pizza',
    lat: 18.4531,
    lng: -69.9418,
    priceTier: 2,
  },
  // --- Added batch: more real SD spots across the target barrios. ---
  {
    key: 'ajuala',
    name: 'Ajuala',
    neighborhood: 'piantini',
    cuisine: 'Dominican',
    lat: 18.4688,
    lng: -69.9372,
    priceTier: 3,
  },
  {
    key: 'casaluca',
    name: 'Casa Luca',
    neighborhood: 'piantini',
    cuisine: 'Italian',
    lat: 18.4696,
    lng: -69.9358,
    priceTier: 4,
  },
  {
    key: 'gijon',
    name: 'Restaurante Gijón',
    neighborhood: 'gazcue',
    cuisine: 'Spanish',
    lat: 18.4622,
    lng: -69.9075,
    priceTier: 3,
  },
  {
    key: 'maraca',
    name: 'Maraca',
    neighborhood: 'piantini',
    cuisine: 'Contemporary',
    lat: 18.4671,
    lng: -69.9401,
    priceTier: 3,
  },
  {
    key: 'lila',
    name: 'LILA - Modern Cuisine',
    neighborhood: 'piantini',
    cuisine: 'Contemporary',
    lat: 18.4703,
    lng: -69.9366,
    priceTier: 4,
  },
  {
    key: 'larimar',
    name: 'LARIMAR',
    neighborhood: 'piantini',
    cuisine: 'Mediterranean',
    lat: 18.4709,
    lng: -69.9389,
    priceTier: 4,
  },
  {
    key: 'donpepe',
    name: 'Don Pepe',
    neighborhood: 'bella-vista',
    cuisine: 'Spanish',
    lat: 18.4558,
    lng: -69.9412,
    priceTier: 3,
  },
  {
    key: 'zola',
    name: 'ZOLA',
    neighborhood: 'zona-colonial',
    cuisine: 'Mediterranean',
    lat: 18.4735,
    lng: -69.8828,
    priceTier: 4,
  },
  {
    key: 'rincon',
    name: 'Rincón Restaurante',
    neighborhood: 'evaristo-morales',
    cuisine: 'Dominican',
    lat: 18.4718,
    lng: -69.9302,
    priceTier: 2,
  },
  {
    key: 'shibuya',
    name: 'Shibuya',
    neighborhood: 'piantini',
    cuisine: 'Japanese',
    lat: 18.4684,
    lng: -69.9345,
    priceTier: 4,
  },
  {
    key: 'ichiban',
    name: 'Ichiban',
    neighborhood: 'naco',
    cuisine: 'Japanese',
    lat: 18.4726,
    lng: -69.9215,
    priceTier: 3,
  },
  {
    key: 'filigrana',
    name: 'Filigrana',
    neighborhood: 'piantini',
    cuisine: 'Tapas',
    lat: 18.4677,
    lng: -69.9388,
    priceTier: 3,
  },
  {
    key: 'ilbacareto',
    name: 'Il Bacareto',
    neighborhood: 'piantini',
    cuisine: 'Italian',
    lat: 18.4691,
    lng: -69.9377,
    priceTier: 3,
  },
  {
    key: 'olivia',
    name: 'O.Livia',
    neighborhood: 'piantini',
    cuisine: 'Mediterranean',
    lat: 18.4699,
    lng: -69.9352,
    priceTier: 4,
  },
]

// Cover photo by cuisine for spots without a curated mapping.
export const COVER_BY_CUISINE: Record<string, string> = {
  Contemporary: 'cocktails',
  Italian: 'pasta',
  Brasserie: 'branzino',
  Brunch: 'dessert',
  Café: 'dessert',
  Mexican: 'tapas',
  'Wine Bar': 'wine',
  Fusion: 'cocktails',
  Grill: 'steak',
  Steakhouse: 'steak',
  Japanese: 'ceviche',
  Dominican: 'mofongo',
  Sandwiches: 'bar',
  Spanish: 'tapas',
  Tapas: 'tapas',
  Pizza: 'pizza',
  Mediterranean: 'branzino',
  European: 'branzino',
  Basque: 'branzino',
  Peruvian: 'ceviche',
}

const FIRST = [
  'Camila',
  'Sebastián',
  'Valeria',
  'José Miguel',
  'Amelia',
  'Luis',
  'Gabriela',
  'Marcos',
  'Paola',
  'Andrés',
  'Nicole',
  'Raúl',
  'Daniela',
  'Emil',
  'Sofía',
  'Carlos',
  'Laura',
  'Federico',
  'Ana',
  'Manuel',
  'Rosa',
  'Iván',
  'Patricia',
  'Héctor',
  'Karla',
  'Omar',
  'Melissa',
  'Julio',
  'Nathalie',
  'Ramón',
  'Yamila',
  'Pedro',
]
const LAST = [
  'Guzmán',
  'Peña',
  'Rodríguez',
  'Santos',
  'Herrera',
  'Vargas',
  'Castillo',
  'Núñez',
  'Reyes',
  'Marte',
  'Polanco',
  'Tavárez',
  'Bautista',
  'Lora',
  'Pimentel',
  'Cabrera',
  'Rosario',
  'Medina',
  'Féliz',
  'Aquino',
  'Brito',
  'Disla',
  'Ortiz',
  'Paulino',
  'Suárez',
  'Camacho',
  'Jiménez',
  'Aybar',
  'Del Rosario',
  'Mena',
  'Cordero',
  'Valdez',
]
const BIOS = [
  'Siempre buscando la próxima mesa.',
  'Foodie de fin de semana, oficinista entre semana.',
  'Si tiene terraza, ahí estoy.',
  'Vino natural o nada.',
  'El brunch es mi religión.',
  'Comiendo por la 27 y más allá.',
  'Team espresso martini.',
  'Crítico no oficial de mofongo.',
  'La Zona los jueves, Piantini los sábados.',
  'Cazando el mejor ceviche de SD.',
]

const NOTE_TEMPLATES = [
  'El {dish} está en otro nivel.',
  'Vine por el {dish}, me quedé por el ambiente.',
  'Pide el {dish} y me lo agradeces después.',
  'Terraza + {dish} = plan perfecto.',
  'El {dish} de aquí no tiene competencia.',
  'Servicio impecable y el {dish} brutal.',
  'Ambiente chichi pero el {dish} lo vale.',
  'Para una primera cita: {dish} y listo.',
  'Los jueves con el {dish} y buena música.',
  'Mi lugar seguro. El {dish} nunca falla.',
  'Caro pero el {dish} justifica todo.',
  'Vibes de NYC con {dish} criollo.',
  'El {dish} me hizo volver tres veces en un mes.',
  'Hasta tarde, buena barra, y ese {dish}…',
  'Sobrevalorado menos el {dish}. Eso sí está bueno.',
]

const DISHES: Record<string, string[]> = {
  Italian: ['risotto de hongos', 'cacio e pepe', 'burrata', 'tagliatelle al tartufo'],
  Pizza: ['margherita', 'pizza de prosciutto', 'calzone'],
  Dominican: ['mofongo', 'chivo guisado', 'sancocho', 'tostones'],
  Steakhouse: ['churrasco', 'bife de chorizo', 'ojo de bife'],
  Grill: ['churrasco', 'costillas', 'pollo al carbón'],
  Japanese: ['sashimi', 'ramen', 'tempura'],
  Spanish: ['tortilla', 'croquetas', 'jamón ibérico', 'paella'],
  Tapas: ['croquetas', 'pulpo a la gallega', 'patatas bravas'],
  Mexican: ['tacos al pastor', 'esquites', 'margarita de tamarindo'],
  Brunch: ['pancakes', 'huevos benedictinos', 'avocado toast'],
  Café: ['flat white', 'croissant de almendra', 'cheesecake'],
  Brasserie: ['steak frites', 'tartar de atún', 'crème brûlée'],
  Contemporary: ['tiradito', 'short rib', 'tuna tataki'],
  'Wine Bar': ['tabla de quesos', 'orange wine', 'bruschetta'],
  Fusion: ['bao de pernil', 'tartar de mango', 'ceviche criollo'],
  Sandwiches: ['sándwich de pierna', 'batida de lechosa'],
  Mediterranean: ['pulpo', 'hummus', 'branzino'],
  European: ['branzino', 'risotto nero', 'foie'],
  Basque: ['txuleta', 'kokotxas', 'menú degustación'],
  Peruvian: ['ceviche mixto', 'lomo saltado', 'causa'],
}

// Occasion vocabulary (Phase 6 mocks). The first five are the settable chips in
// the rank flow's note step (B4); the rest enrich the aggregated characteristics
// line on a profile (D1). Title-case, English — a controlled vocabulary, unlike
// the free-form Spanish vibe notes.
export const TAGS = [
  'Date Night',
  'Special Occasion',
  'Group Dinner',
  'Outdoor',
  'Solo',
  'Fine Dining',
  'Casual',
  'Late Night',
]

export interface GeneratedUser {
  handle: string
  name: string
  neighborhood: string
  bio: string
  // ordered best-first restaurant keys
  ranked: { key: string; note?: string; tags?: string[]; dish?: string; daysAgo: number }[]
  wantToTry: string[]
  followsHandles: string[]
}

const ALL_HOODS = [
  'piantini',
  'naco',
  'bella-vista',
  'serralles',
  'zona-colonial',
  'gazcue',
  'evaristo-morales',
]

/** Deterministically build the 32 generated users. */
export function generateUsers(
  allKeys: { key: string; cuisine: string }[],
  curatedHandles: string[],
): GeneratedUser[] {
  const rand = mulberry32(4242)
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)] as T
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[a[i], a[j]] = [a[j] as T, a[i] as T]
    }
    return a
  }

  const users: GeneratedUser[] = []
  const usedHandles = new Set(curatedHandles)

  for (let u = 0; u < 32; u++) {
    const first = FIRST[u % FIRST.length] as string
    const last = LAST[(u * 7 + 3) % LAST.length] as string
    let handle = first
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, '')
    if (usedHandles.has(handle)) handle = `${handle}${(u % 97) + 2}`
    usedHandles.add(handle)

    const count = 8 + Math.floor(rand() * 15) // 8–22 rankings
    const keys = shuffle(allKeys).slice(0, count)
    const ranked = keys.map((k, i) => {
      const dishes = DISHES[k.cuisine] ?? ['plato de la casa']
      const dish = pick(dishes)
      const hasNote = rand() < 0.7
      const note = hasNote ? (pick(NOTE_TEMPLATES) as string).replace('{dish}', dish) : undefined
      const tags = rand() < 0.5 ? shuffle(TAGS).slice(0, 1 + Math.floor(rand() * 2)) : undefined
      // Newest rankings cluster near the top of the list; everything within 6 weeks.
      const daysAgo = i < 2 ? rand() * 3 : rand() * 42
      return { key: k.key, note, tags, dish: rand() < 0.45 ? dish : undefined, daysAgo }
    })

    const wantToTry = shuffle(allKeys)
      .slice(0, 2 + Math.floor(rand() * 4))
      .map((k) => k.key)
      .filter((k) => !keys.some((r) => r.key === k))

    // Everyone follows 2–6 curated friends (keeps the demo cluster central) plus
    // 3–9 fellow generated users — a dense but organic-feeling graph.
    const followsHandles = [
      ...shuffle(curatedHandles).slice(0, 2 + Math.floor(rand() * 5)),
      ...shuffle(users.map((x) => x.handle)).slice(
        0,
        Math.min(users.length, 3 + Math.floor(rand() * 7)),
      ),
    ]

    users.push({
      handle,
      name: `${first} ${last}`,
      neighborhood: ALL_HOODS[(u * 3 + 1) % ALL_HOODS.length] as string,
      bio: pick(BIOS),
      ranked,
      wantToTry,
      followsHandles,
    })
  }
  return users
}
