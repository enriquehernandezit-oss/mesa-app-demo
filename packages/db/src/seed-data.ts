// The dense demo cluster. This is what makes the feed full on first open instead
// of empty — cold-start is the #1 product risk (BUILD_PLAN).
//
// Restaurants are REAL Santo Domingo places across the five target
// neighborhoods, with approximate real coordinates so MapBox pins land in the
// right place. Every restaurant row is flagged isDemo so seed data is never
// confused with real listings later. The friends, their rankings, and the vibe
// notes are fictional and clearly attributed to demo accounts.

export type NeighborhoodSeed = {
  slug: string
  name: string
  // Centroid + jitter radius (meters) — the average of this sector's own
  // restaurants below, not a guess. Kept in sync by hand with migration
  // 0008's backfill, which computed these same values for an existing DB;
  // a fresh `db:seed` needs to produce identical numbers.
  lat: number
  lng: number
  radiusM: number
}

export const neighborhoods: NeighborhoodSeed[] = [
  { slug: 'piantini', name: 'Piantini', lat: 18.4688, lng: -69.9374, radiusM: 623 },
  { slug: 'naco', name: 'Naco', lat: 18.4728, lng: -69.9272, radiusM: 902 },
  { slug: 'bella-vista', name: 'Bella Vista', lat: 18.455, lng: -69.9417, radiusM: 400 },
  { slug: 'serralles', name: 'Serrallés', lat: 18.463, lng: -69.9292, radiusM: 400 },
  { slug: 'zona-colonial', name: 'Zona Colonial', lat: 18.4739, lng: -69.8849, radiusM: 743 },
]

export type RestaurantSeed = {
  key: string // seed-only handle for wiring rankings; not a DB column
  name: string
  neighborhood: string // slug
  cuisine: string
  lat: number
  lng: number
}

// Approximate real coordinates within each neighborhood.
export const restaurants: RestaurantSeed[] = [
  // Piantini
  {
    key: 'sophias',
    name: "Sophia's Bar & Grill",
    neighborhood: 'piantini',
    cuisine: 'Contemporary',
    lat: 18.4682,
    lng: -69.9385,
  },
  {
    key: 'peperoni',
    name: 'Peperoni',
    neighborhood: 'piantini',
    cuisine: 'Italian',
    lat: 18.4675,
    lng: -69.935,
  },
  {
    key: 'mijas',
    name: 'Mijas',
    neighborhood: 'piantini',
    cuisine: 'Spanish',
    lat: 18.469,
    lng: -69.936,
  },
  // Naco
  {
    key: 'boga',
    name: 'Boga Boga',
    neighborhood: 'naco',
    cuisine: 'Basque',
    lat: 18.4718,
    lng: -69.9268,
  },
  {
    key: 'segundo',
    name: 'Segundo Muelle',
    neighborhood: 'naco',
    cuisine: 'Peruvian',
    lat: 18.4725,
    lng: -69.9295,
  },
  {
    key: 'bottega',
    name: 'Bottega Fratelli',
    neighborhood: 'naco',
    cuisine: 'Italian',
    lat: 18.473,
    lng: -69.928,
  },
  // Bella Vista
  {
    key: 'mitre',
    name: 'Mitre',
    neighborhood: 'bella-vista',
    cuisine: 'Wine Bar',
    lat: 18.4562,
    lng: -69.9418,
  },
  {
    key: 'adrian',
    name: 'Adrian Tropical',
    neighborhood: 'bella-vista',
    cuisine: 'Dominican',
    lat: 18.455,
    lng: -69.94,
  },
  {
    key: 'vesuvio',
    name: 'Vesuvio Sarasota',
    neighborhood: 'bella-vista',
    cuisine: 'Italian',
    lat: 18.4548,
    lng: -69.9435,
  },
  // Serrallés
  {
    key: 'cava',
    name: 'El Mesón de la Cava',
    neighborhood: 'serralles',
    cuisine: 'Steakhouse',
    lat: 18.4625,
    lng: -69.9285,
  },
  {
    key: 'positano',
    name: 'Positano',
    neighborhood: 'serralles',
    cuisine: 'Mediterranean',
    lat: 18.4635,
    lng: -69.93,
  },
  // Zona Colonial
  {
    key: 'patepalo',
    name: "Pat'e Palo European Brasserie",
    neighborhood: 'zona-colonial',
    cuisine: 'European',
    lat: 18.4776,
    lng: -69.8823,
  },
  {
    key: 'lulu',
    name: 'Lulú Tasting Bar',
    neighborhood: 'zona-colonial',
    cuisine: 'Tapas',
    lat: 18.4726,
    lng: -69.8848,
  },
  {
    key: 'jalao',
    name: 'Jalao',
    neighborhood: 'zona-colonial',
    cuisine: 'Dominican',
    lat: 18.4735,
    lng: -69.8843,
  },
  {
    key: 'mesonbari',
    name: 'Mesón de Bari',
    neighborhood: 'zona-colonial',
    cuisine: 'Dominican',
    lat: 18.475,
    lng: -69.887,
  },
]

export type FriendSeed = {
  handle: string
  name: string
  neighborhood: string // slug
  bio: string
  // Ordered ranked list (best first). Each entry carries the one-line vibe note.
  ranked: { key: string; note: string }[]
  wantToTry?: string[] // restaurant keys saved for later
}

// Eight friends who already follow each other (the follow graph is built in the
// seed as a complete cluster). Their ranked lists overlap on purpose — that
// overlap is what makes "you both love Boga, she ranks it #1" moments possible.
export const friends: FriendSeed[] = [
  {
    handle: 'caro',
    name: 'Carolina Objío',
    neighborhood: 'piantini',
    bio: 'Piantini. Vive por un buen martini y una mesa afuera.',
    ranked: [
      { key: 'boga', note: 'El menú de degustación vale cada peso. Reserva con tiempo.' },
      { key: 'lulu', note: 'Vinos naturales y tapas hasta tarde. Mi lugar feliz.' },
      { key: 'sophias', note: 'Clásico que nunca falla para una cena de grupo.' },
      { key: 'mitre', note: 'La carta de vinos es una locura. Pide el flight.' },
      { key: 'positano', note: 'La terraza un jueves = plan perfecto.' },
      { key: 'peperoni', note: 'El risotto de hongos, siempre.' },
    ],
    wantToTry: ['patepalo', 'segundo'],
  },
  {
    handle: 'dieguito',
    name: 'Diego Read',
    neighborhood: 'naco',
    bio: 'Naco. Carne, vino tinto y after de espresso martini.',
    ranked: [
      { key: 'cava', note: 'Cenar dentro de una cueva pega distinto. El churrasco top.' },
      { key: 'boga', note: 'Lo mejor de la ciudad ahora mismo, sin discusión.' },
      { key: 'bottega', note: 'Pastas frescas y ambiente de barrio. Voy cada semana.' },
      { key: 'sophias', note: 'Para cerrar negocios con buen bife.' },
      { key: 'mitre', note: 'Barra de vinos, luz baja, jueves de amigos.' },
      { key: 'jalao', note: 'Cuando quiero mangú y música en la Zona.' },
      { key: 'adrian', note: 'Los tostones con la vista del Malecón, un clásico.' },
    ],
  },
  {
    handle: 'valen',
    name: 'Valentina Pérez',
    neighborhood: 'bella-vista',
    bio: 'Bella Vista. Cazadora de terrazas y postres.',
    ranked: [
      { key: 'lulu', note: 'La barra, una copa de natural y ya. Perfecto.' },
      { key: 'positano', note: 'Pulpo y vista. No pido más.' },
      { key: 'vesuvio', note: 'Pizza al horno de leña como debe ser.' },
      { key: 'mijas', note: 'Las tapas y la sangría los domingos.' },
      { key: 'peperoni', note: 'Mi comfort food de siempre.' },
    ],
    wantToTry: ['boga', 'cava'],
  },
  {
    handle: 'isa',
    name: 'Isabela Guerrero',
    neighborhood: 'zona-colonial',
    bio: 'Zona Colonial. Vino natural > todo.',
    ranked: [
      { key: 'patepalo', note: 'Cena en Plaza España al atardecer. Insuperable.' },
      { key: 'lulu', note: 'Mi segunda casa. La burrata, por favor.' },
      { key: 'mesonbari', note: 'Sancocho y arte en las paredes. Puro Santo Domingo.' },
      { key: 'jalao', note: 'Para llevar a los de afuera y que floreen.' },
      { key: 'boga', note: 'Me convirtió. Ese arroz de la casa.' },
      { key: 'mitre', note: 'Cierre de noche con una copa de tinto.' },
    ],
  },
  {
    handle: 'mateo',
    name: 'Mateo Bonetti',
    neighborhood: 'piantini',
    bio: 'Piantini. Sushi, steak y sobremesa larga.',
    ranked: [
      { key: 'sophias', note: 'El bife de chorizo y punto.' },
      { key: 'boga', note: 'Alta cocina sin pretensión. Brutal.' },
      { key: 'segundo', note: 'Ceviche mixto para empezar cualquier plan.' },
      { key: 'bottega', note: 'Cacio e pepe que me arregla la semana.' },
      { key: 'cava', note: 'Lugar de aniversarios. La cueva impresiona.' },
    ],
    wantToTry: ['vesuvio'],
  },
  {
    handle: 'lucia',
    name: 'Lucía Fernández',
    neighborhood: 'naco',
    bio: 'Naco. Brunch, natural wine y planes espontáneos.',
    ranked: [
      { key: 'segundo', note: 'Tiradito de la casa. Fresco y perfecto.' },
      { key: 'positano', note: 'Domingo de pasta y mar. Sí.' },
      { key: 'lulu', note: 'Mi bar de confianza para after work.' },
      { key: 'peperoni', note: 'Pizza margherita bien hecha, nada más que pedir.' },
      { key: 'mijas', note: 'Tortilla y croquetas con las amigas.' },
      { key: 'adrian', note: 'Desayuno dominicano con vista. Un lujo simple.' },
    ],
  },
  {
    handle: 'rafa',
    name: 'Rafael Then',
    neighborhood: 'serralles',
    bio: 'Serrallés. Carnes, puros y buen ron.',
    ranked: [
      { key: 'cava', note: 'Mi spot de siempre. Pide el cordero.' },
      { key: 'mitre', note: 'Vinos por copa que no encuentras en otro lado.' },
      { key: 'sophias', note: 'Cuando la ocasión pide mantel largo.' },
      { key: 'patepalo', note: 'La brasserie de la Zona. Ostras y champán.' },
      { key: 'boga', note: 'Me sorprendió. Merece cada estrella que le dan.' },
    ],
    wantToTry: ['lulu'],
  },
  {
    handle: 'nati',
    name: 'Natalia Cruz',
    neighborhood: 'bella-vista',
    bio: 'Bella Vista. Terrazas, tapas y planes de última hora.',
    ranked: [
      { key: 'mijas', note: 'Las tapas los jueves, sin falta.' },
      { key: 'vesuvio', note: 'Pizza y vino de la casa en la terraza.' },
      { key: 'lulu', note: 'Para cuando quiero algo natural y tranquilo.' },
      { key: 'positano', note: 'El mejor pulpo de la ciudad, lo sostengo.' },
      { key: 'jalao', note: 'Bailar y comer en la Zona. Todo en uno.' },
      { key: 'bottega', note: 'Pasta casera y precio justo. Un hallazgo.' },
    ],
    wantToTry: ['patepalo', 'cava'],
  },
]

// Seeded dish posts (Phase 6). Each attaches to a ranking a curated friend
// actually holds (handle must appear with `key` in that friend's `ranked` list
// above) so the NOT-NULL rankingId constraint is satisfied. `photo` is one of the
// shared food JPEGs in apps/app/public/restaurants/. Dish names/captions are the
// one place we write in English — the dish post is the new hero content and the
// design mocks it in English; the vibe notes stay Spanish.
export type DishSeed = {
  handle: string
  key: string
  name: string
  caption: string
  photo: string
  grain: 'candlelit' | 'daylight' | 'none'
}
export const dishPosts: DishSeed[] = [
  {
    handle: 'caro',
    key: 'boga',
    name: 'Branzino a la sal',
    caption: 'Get the branzino, sit outside.',
    photo: 'branzino',
    grain: 'candlelit',
  },
  {
    handle: 'caro',
    key: 'peperoni',
    name: 'Wild mushroom risotto',
    caption: 'Order it, thank me later.',
    photo: 'pasta',
    grain: 'none',
  },
  {
    handle: 'dieguito',
    key: 'cava',
    name: 'Short rib, 14 hours',
    caption: 'Falls apart under the fork.',
    photo: 'steak',
    grain: 'candlelit',
  },
  {
    handle: 'dieguito',
    key: 'bottega',
    name: 'Cacio e pepe',
    caption: 'Fixes my whole week.',
    photo: 'pasta',
    grain: 'daylight',
  },
  {
    handle: 'valen',
    key: 'positano',
    name: 'Grilled octopus',
    caption: 'Octopus and a view. I ask for nothing else.',
    photo: 'branzino',
    grain: 'none',
  },
  {
    handle: 'valen',
    key: 'vesuvio',
    name: 'Margherita, wood-fired',
    caption: 'The oven does all the work.',
    photo: 'pizza',
    grain: 'daylight',
  },
  {
    handle: 'isa',
    key: 'lulu',
    name: 'Burrata, green oil',
    caption: 'My second home. The burrata, please.',
    photo: 'tapas',
    grain: 'candlelit',
  },
  {
    handle: 'isa',
    key: 'mesonbari',
    name: 'Sancocho de la casa',
    caption: 'Art on the walls, sancocho on the table.',
    photo: 'mofongo',
    grain: 'none',
  },
  {
    handle: 'mateo',
    key: 'segundo',
    name: 'Ceviche mixto',
    caption: 'How every plan should start.',
    photo: 'ceviche',
    grain: 'daylight',
  },
  {
    handle: 'lucia',
    key: 'positano',
    name: 'Tagliatelle al mare',
    caption: 'Sunday pasta by the sea.',
    photo: 'pasta',
    grain: 'none',
  },
  {
    handle: 'rafa',
    key: 'mitre',
    name: 'Cheese board + tinto',
    caption: "A pour you won't find anywhere else.",
    photo: 'wine',
    grain: 'candlelit',
  },
  {
    handle: 'nati',
    key: 'mijas',
    name: 'Croquetas de jamón',
    caption: 'Thursday tapas, no excuses.',
    photo: 'tapas',
    grain: 'daylight',
  },
]

// Waitlist rows mirror the pre-launch quiz so quiz-takers are known users.
export const waitlist = [
  { email: 'quiz-lead-1@example.com', instagramHandle: 'foodie.rd', quizResult: 'La Anfitriona' },
  {
    email: 'quiz-lead-2@example.com',
    instagramHandle: 'come.conmigo',
    quizResult: 'El Explorador',
  },
]

// Derives a 0–100 display score from a place's position in an ordered list.
// Top of a list scores ~95, tapering toward ~62 at the bottom — the pairwise
// flow (M2/M3) will replace this with a comparison-derived score, but the shape
// (higher = better, monotonic with position) is the same.
export function scoreForPosition(position: number, listLength: number): number {
  if (listLength <= 1) return 95
  const t = (position - 1) / (listLength - 1) // 0 at top .. 1 at bottom
  return Math.round(95 - t * 33)
}
