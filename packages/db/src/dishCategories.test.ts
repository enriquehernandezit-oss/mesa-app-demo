import { describe, expect, test } from 'bun:test'
import { DISH_CATEGORIES, DISH_GROUPS, guessDishCategory } from './dishCategories'

describe('taxonomy shape', () => {
  test('every keyword is unique across the whole taxonomy', () => {
    const seen = new Map<string, string>()
    for (const cat of DISH_CATEGORIES) {
      for (const keyword of cat.keywords) {
        const prior = seen.get(keyword)
        expect(prior, `"${keyword}" appears in both ${prior} and ${cat.id}`).toBeUndefined()
        seen.set(keyword, cat.id)
      }
    }
  })

  test('every category has at least one keyword, except otro', () => {
    for (const cat of DISH_CATEGORIES) {
      if (cat.id === 'otro') {
        expect(cat.keywords.length).toBe(0)
      } else {
        expect(cat.keywords.length).toBeGreaterThan(0)
      }
    }
  })

  test('every category references a real group', () => {
    const groupIds = new Set(DISH_GROUPS.map((g) => g.id))
    for (const cat of DISH_CATEGORIES) {
      expect(groupIds.has(cat.group), `${cat.id} references unknown group "${cat.group}"`).toBe(
        true,
      )
    }
  })

  test('category ids are unique', () => {
    const ids = DISH_CATEGORIES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('sortOrder is unique', () => {
    const orders = DISH_CATEGORIES.map((c) => c.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })
})

describe('guessDishCategory — fixtures from the real local dish names', () => {
  const cases: [string, string][] = [
    ['Tostones', 'fritura'],
    ['Chivo guisado', 'guisado'],
    ['Ensalada de pulpo', 'ensalada'],
    ['Pulpo a la gallega', 'tapas'],
    ['Tuna tataki', 'pescado'],
    ['Orange wine', 'vino'],
    ['Ramen', 'ramen'],
    ['Pad thai', 'noodles'],
    ['Sancocho', 'sancocho'],
    ['Mangú', 'mangu'],
    ['Flat white', 'cafe'],
    ['Margherita, wood-fired', 'pizza'],
    ['Pica pollo', 'pollo'],
    ['Pollo a la brasa', 'peruano'],
    ['Arroz chino', 'chino'],
    ['Costillas bbq', 'bbq'],
    ['Croquetas de jamón', 'tapas'],
    ['Burrata, green oil', 'antipasto'],
    ['Hummus', 'mezze'],
    ['Tabla de quesos', 'entrada'],
    ['Açaí bowl', 'saludable'],
    ['xyz not a real dish', 'otro'],
    // A few more from the actual local seed dish names / favoriteDish sample.
    ['Cacio e pepe', 'pasta'],
    ['Ceviche criollo', 'ceviche'],
    ['Croissant de almendra', 'panaderia'],
    ['Paella', 'paella'],
    // "tartar" is a raw preparation style (like ceviche/crudo), which is a
    // more useful cross-restaurant bucket than the generic fish category.
    ['Tartar de atún', 'ceviche'],
    ['Huevos benedictinos', 'brunch'],
    ['Sándwich de pierna', 'sandwich'],
    ['Sashimi', 'sushi'],
    ['Txuleta', 'carne'],
    // "pernil" (the filling) is a longer, more specific match than "bao" —
    // a reasonable guess either way; the user can correct it in the picker.
    ['Bao de pernil', 'cerdo'],
    ['Batida de lechosa', 'bebida'],
    ['Cheesecake', 'postre'],
    ['Lomo saltado', 'peruano'],
    ['Ojo de bife', 'carne'],
    ['Patatas bravas', 'tapas'],
    ['Pulpo a la gallega', 'tapas'],
    ['Tempura', 'japones'],
    ['Bife de chorizo', 'carne'],
    ['Bruschetta', 'antipasto'],
    ['Costillas', 'bbq'],
    ['Crème brûlée', 'postre'],
    ['Foie', 'frances'],
    ['Margarita de tamarindo', 'coctel'],
    ['Pancakes', 'brunch'],
    ['Short rib, 14 hours', 'carne'],
    ['Branzino a la sal', 'pescado'],
    ['Grilled octopus', 'mariscos'],
    ['Tagliatelle al mare', 'pasta'],
    ['Wild mushroom risotto', 'risotto'],
    // M13 — the keyword database expansion (see packages/db/src/dishes-audit.ts
    // for the audit against the real 3,107-item Top 100 menu catalog).
    ['Rib eye', 'carne'],
    ['Ribeye Angus, 16 oz', 'carne'],
    // "French Dip Sandwich" beats plain "dip" (entrada) on keyword length.
    ['French Dip Sandwich', 'sandwich'],
    ['Tomahawk, 40 oz for two', 'carne'],
    ['Porterhouse', 'carne'],
    ['Beef Stroganoff', 'carne'],
    ['Chuletón Angus', 'carne'],
    ['Pechuga a la plancha', 'pollo'],
    ['Cochinita pibil', 'cerdo'],
    ['Chirashi', 'sushi'],
    ['Guacamole', 'mexicano'],
    ['Crab Stuffed Mushrooms', 'mariscos'],
    ['Mac & Cheese', 'americano'],
    ['Kim Crawford Sauvignon Blanc', 'vino'],
  ]

  for (const [name, expected] of cases) {
    test(`"${name}" -> ${expected}`, () => {
      expect(guessDishCategory(name)).toBe(expected)
    })
  }
})

describe('guessDishCategory — matching mechanics', () => {
  test('longest matching keyword wins over a shorter one', () => {
    // "pollo" (pollo) vs "pollo guisado" (guisado) — guisado's phrase is longer.
    expect(guessDishCategory('Pollo guisado')).toBe('guisado')
  })

  test('plurals are tolerated', () => {
    expect(guessDishCategory('Tacos')).toBe('tacos')
    expect(guessDishCategory('Camarones al ajillo')).toBe('mariscos')
  })

  test('no match falls back to otro', () => {
    expect(guessDishCategory('Completely unrelated made-up word zzqx')).toBe('otro')
  })

  test('is case- and accent-insensitive', () => {
    expect(guessDishCategory('SANCOCHO')).toBe('sancocho')
    expect(guessDishCategory('café con leche')).toBe('cafe')
  })
})
