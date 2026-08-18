// Tonight / Sobremesa fixtures (Phase 6 mocks I1–I2). Per the founder's call this
// flow is demo-only: typed static tables, and every seat action (Join / Take a
// seat) is inert. No schema, no API. Photos reference the shared food JPEGs in
// apps/app/public/restaurants/; scores are stored 0–100 (shown /10) so they read
// through the same ScoreBadge as everywhere else. A table is a friend opening
// seats at a place they've ranked — the host's score is why the table exists.

export interface TonightPerson {
  name: string
  image?: string | null
}

export interface TonightTable {
  id: string
  restaurant: { name: string; cuisine: string; neighborhood: string; photo: string }
  host: TonightPerson
  hostScore: number // 0–100, the host's ranking of this place
  seatsTotal: number
  seatsTaken: number
  time: string // display, e.g. "8:30p"
  hour: number // 24h, for the "8p+" filter
  whoIn: TonightPerson[] // people already seated besides the host
}

export const TONIGHT_TABLES: TonightTable[] = [
  {
    id: 'sophias-830',
    restaurant: {
      name: "Sophia's Bar & Grill",
      cuisine: 'Contemporary',
      neighborhood: 'Piantini',
      photo: 'cocktails',
    },
    host: { name: 'Diego Read' },
    hostScore: 90,
    seatsTotal: 6,
    seatsTaken: 4,
    time: '8:30p',
    hour: 20,
    whoIn: [{ name: 'Lucía Fernández' }, { name: 'Javier Brito' }],
  },
  {
    id: 'boga-945',
    restaurant: { name: 'Boga Boga', cuisine: 'Basque', neighborhood: 'Naco', photo: 'branzino' },
    host: { name: 'Carolina Objío' },
    hostScore: 95,
    seatsTotal: 6,
    seatsTaken: 2,
    time: '9:45p',
    hour: 21,
    whoIn: [{ name: 'Mateo Bonetti' }],
  },
  {
    id: 'jalao-10',
    restaurant: {
      name: 'Jalao',
      cuisine: 'Dominican',
      neighborhood: 'Zona Colonial',
      photo: 'mofongo',
    },
    host: { name: 'Isabela Guerrero' },
    hostScore: 88,
    seatsTotal: 8,
    seatsTaken: 6,
    time: '10:00p',
    hour: 22,
    whoIn: [{ name: 'Natalia Cruz' }, { name: 'Rafael Then' }],
  },
  {
    id: 'lulu-7',
    restaurant: {
      name: 'Lulú Tasting Bar',
      cuisine: 'Tapas',
      neighborhood: 'Zona Colonial',
      photo: 'tapas',
    },
    host: { name: 'Valentina Pérez' },
    hostScore: 91,
    seatsTotal: 4,
    seatsTaken: 1,
    time: '7:00p',
    hour: 19,
    whoIn: [],
  },
  {
    id: 'positano-915',
    restaurant: {
      name: 'Positano',
      cuisine: 'Mediterranean',
      neighborhood: 'Bella Vista',
      photo: 'dessert',
    },
    host: { name: 'Lucía Fernández' },
    hostScore: 87,
    seatsTotal: 5,
    seatsTaken: 5,
    time: '9:15p',
    hour: 21,
    whoIn: [{ name: 'Carolina Objío' }, { name: 'Diego Read' }, { name: 'Mateo Bonetti' }],
  },
]

export function seatsLeft(t: TonightTable): number {
  return Math.max(0, t.seatsTotal - t.seatsTaken)
}

export function tonightTable(id: string): TonightTable | undefined {
  return TONIGHT_TABLES.find((t) => t.id === id)
}

// "Fri 9 Aug" — the mono date pill. Computed at render (browser Date is fine).
export function tonightDateLabel(d: Date): string {
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' })
  const mo = d.toLocaleDateString('en-US', { month: 'short' })
  return `${wd} ${d.getDate()} ${mo}`
}
