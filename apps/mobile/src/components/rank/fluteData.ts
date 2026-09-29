// The flute's seeded scatter — every bubble, bead of mousse, twinkle of spray and dot of fog, in
// the 300×300 box the drawing is made in. Extracted ONCE from the approved design
// (docs/design/rating/F17-Bubbles.dc.html, generated with a fixed seed), so the app draws
// exactly the bubbles that were chosen and never re-rolls them. Raw numbers only; nothing
// here is worth editing by hand. `Flute.tsx` turns them into shapes.

// A bubble that rises from (x, y) and dies at the surface: `dur` seconds a trip, and it starts
// `delay` seconds into it so the stream is already full on the first frame.
export type Rise = { x: number; y: number; r: number; dur: number; delay: number }

// Where the drink's surface is, and the height a bubble reaches (just under it).
export const SURFACE_Y = 58
export const RISE_TO_Y = SURFACE_Y + 3

// One thin stream from the bottom — "it was fine".
export const FEW: Rise[] = [
  { x: 149.58, y: 188.0, r: 1.34, dur: 4.04, delay: 0.0 },
  { x: 150.17, y: 188.0, r: 1.4, dur: 3.65, delay: 0.6 },
  { x: 149.22, y: 188.0, r: 1.57, dur: 3.9, delay: 1.2 },
  { x: 149.57, y: 188.0, r: 1.7, dur: 4.16, delay: 1.8 },
  { x: 150.54, y: 188.0, r: 1.28, dur: 4.38, delay: 2.4 },
  { x: 149.44, y: 188.0, r: 1.41, dur: 4.66, delay: 3.0 },
  { x: 150.04, y: 188.0, r: 1.49, dur: 4.42, delay: 3.6 },
]

// Five streams, six bubbles each — "loved it".
export const MANY: Rise[] = [
  { x: 148.3, y: 188.0, r: 1.51, dur: 2.47, delay: 0.0 },
  { x: 148.68, y: 188.0, r: 0.92, dur: 2.66, delay: 0.4 },
  { x: 148.96, y: 188.0, r: 1.48, dur: 2.67, delay: 0.8 },
  { x: 149.34, y: 188.0, r: 1.64, dur: 2.32, delay: 1.2 },
  { x: 149.48, y: 188.0, r: 1.26, dur: 2.71, delay: 1.6 },
  { x: 149.61, y: 188.0, r: 0.98, dur: 2.14, delay: 2.0 },
  { x: 151.55, y: 186.0, r: 1.67, dur: 2.35, delay: 0.0 },
  { x: 152.2, y: 186.0, r: 1.14, dur: 2.41, delay: 0.4 },
  { x: 151.82, y: 186.0, r: 1.18, dur: 2.46, delay: 0.8 },
  { x: 152.13, y: 186.0, r: 1.62, dur: 2.53, delay: 1.2 },
  { x: 152.69, y: 186.0, r: 1.59, dur: 2.75, delay: 1.6 },
  { x: 152.27, y: 186.0, r: 1.03, dur: 2.66, delay: 2.0 },
  { x: 141.74, y: 150.0, r: 1.62, dur: 2.45, delay: 0.0 },
  { x: 141.34, y: 150.0, r: 1.07, dur: 2.64, delay: 0.4 },
  { x: 141.12, y: 150.0, r: 1.13, dur: 2.09, delay: 0.8 },
  { x: 141.57, y: 150.0, r: 1.69, dur: 2.1, delay: 1.2 },
  { x: 141.48, y: 150.0, r: 1.23, dur: 2.15, delay: 1.6 },
  { x: 140.67, y: 150.0, r: 1.52, dur: 2.67, delay: 2.0 },
  { x: 159.27, y: 126.0, r: 1.39, dur: 2.07, delay: 0.0 },
  { x: 160.35, y: 126.0, r: 1.16, dur: 2.67, delay: 0.4 },
  { x: 160.77, y: 126.0, r: 1.3, dur: 2.76, delay: 0.8 },
  { x: 159.7, y: 126.0, r: 0.96, dur: 2.47, delay: 1.2 },
  { x: 159.25, y: 126.0, r: 1.06, dur: 2.33, delay: 1.6 },
  { x: 160.18, y: 126.0, r: 1.02, dur: 2.07, delay: 2.0 },
  { x: 137.59, y: 104.0, r: 1.15, dur: 2.73, delay: 0.0 },
  { x: 137.63, y: 104.0, r: 1.2, dur: 2.37, delay: 0.4 },
  { x: 137.03, y: 104.0, r: 1.42, dur: 2.47, delay: 0.8 },
  { x: 137.09, y: 104.0, r: 1.4, dur: 2.72, delay: 1.2 },
  { x: 137.01, y: 104.0, r: 1.24, dur: 2.56, delay: 1.6 },
  { x: 136.58, y: 104.0, r: 1.14, dur: 2.74, delay: 2.0 },
]

// Beads clinging to the glass wall, [x, y, r] — "loved it".
export const CLING: [number, number, number][] = [
  [130.6, 113.9, 1.0],
  [129.0, 103.2, 1.2],
  [130.7, 71.6, 0.7],
  [130.8, 120.6, 1.1],
  [129.2, 120.2, 1.2],
  [130.4, 124.3, 0.9],
  [130.1, 126.6, 0.9],
  [168.8, 71.8, 1.3],
  [170.8, 124.1, 0.9],
  [168.1, 90.1, 0.8],
  [169.6, 117.4, 1.0],
  [170.0, 99.1, 1.2],
  [170.1, 99.5, 0.8],
  [169.2, 94.0, 0.9],
]

// The ring of foam on the surface, [x, y, r] — "loved it".
export const MOUSSE: [number, number, number][] = [
  [142.0, 61.7, 1.1],
  [167.1, 59.5, 1.0],
  [157.2, 61.8, 1.1],
  [136.8, 59.4, 1.2],
  [135.2, 61.6, 1.5],
  [134.8, 59.9, 1.4],
  [156.8, 61.6, 1.0],
  [132.2, 59.9, 1.4],
  [139.0, 60.1, 1.1],
  [146.1, 60.3, 1.5],
  [133.5, 59.0, 1.5],
  [168.2, 62.2, 1.1],
  [171.6, 62.0, 0.9],
  [161.8, 61.7, 1.3],
  [150.9, 59.9, 1.0],
  [136.9, 59.2, 1.2],
  [139.8, 61.6, 0.7],
  [169.4, 61.2, 1.5],
  [169.0, 61.9, 1.2],
  [126.6, 61.4, 0.9],
  [140.4, 61.1, 1.2],
  [145.9, 62.0, 1.3],
  [142.4, 59.8, 1.5],
  [148.9, 61.5, 1.0],
  [135.5, 60.7, 1.4],
  [134.2, 61.5, 1.5],
]

// The fizz over the rim — "loved it". Each twinkles on its own beat (`delay`).
export type Spark = { x: number; y: number; r: number; delay: number }
export const SPRAY: Spark[] = [
  { x: 162.2, y: 26.1, r: 0.6, delay: 1.13 },
  { x: 164.5, y: 9.1, r: 0.8, delay: 0.48 },
  { x: 151.1, y: 17.3, r: 1.0, delay: 1.4 },
  { x: 130.1, y: 9.2, r: 0.7, delay: 0.22 },
  { x: 132.7, y: 29.4, r: 1.3, delay: 0.16 },
  { x: 150.1, y: 14.9, r: 0.9, delay: 0.63 },
  { x: 155.9, y: 20.9, r: 0.9, delay: 0.34 },
  { x: 143.2, y: 10.7, r: 1.0, delay: 1.29 },
  { x: 145.2, y: 9.8, r: 0.7, delay: 0.67 },
  { x: 154.2, y: 25.2, r: 0.9, delay: 1.44 },
  { x: 154.9, y: 17.5, r: 0.9, delay: 0.89 },
  { x: 158.1, y: 17.3, r: 1.2, delay: 0.83 },
]

// The mist on a cold glass, [x, y, r, opacity] (opacity as drawn by day; night draws it ×0.6).
export const FOG: [number, number, number, number][] = [
  [136.7, 126.2, 1.3, 0.38],
  [146.1, 113.4, 1.5, 0.77],
  [143.5, 168.2, 1.4, 0.47],
  [148.1, 78.3, 1.4, 0.65],
  [170.1, 155.9, 1.3, 0.68],
  [153.3, 76.0, 1.2, 0.35],
  [131.5, 153.8, 0.6, 0.39],
  [129.2, 166.1, 0.8, 0.36],
  [167.8, 78.1, 1.4, 0.65],
  [167.5, 174.5, 1.2, 0.71],
  [125.9, 153.0, 1.1, 0.67],
  [129.6, 150.9, 1.5, 0.38],
  [140.9, 129.4, 1.4, 0.46],
  [133.3, 93.0, 1.2, 0.69],
  [144.5, 106.6, 1.0, 0.51],
  [145.7, 73.7, 1.1, 0.79],
  [145.5, 150.7, 0.8, 0.66],
  [163.3, 142.2, 1.1, 0.57],
  [157.4, 168.1, 0.7, 0.39],
  [162.9, 170.3, 1.1, 0.55],
  [161.4, 85.6, 0.9, 0.44],
  [154.5, 100.5, 0.8, 0.66],
  [173.6, 98.3, 1.3, 0.54],
  [168.4, 131.8, 0.9, 0.45],
  [125.2, 119.6, 1.0, 0.43],
  [142.7, 101.4, 1.4, 0.41],
  [175.5, 119.6, 1.2, 0.56],
  [167.4, 159.3, 1.2, 0.57],
  [161.5, 163.4, 1.0, 0.68],
  [173.9, 118.2, 0.8, 0.46],
  [161.3, 142.3, 1.6, 0.73],
  [136.6, 86.0, 0.9, 0.43],
  [160.6, 163.6, 1.5, 0.46],
  [169.0, 100.4, 1.0, 0.68],
  [128.5, 74.7, 1.4, 0.48],
  [142.5, 131.3, 1.3, 0.35],
  [141.4, 114.6, 1.1, 0.44],
  [154.4, 174.8, 1.0, 0.59],
  [130.2, 95.9, 1.3, 0.4],
  [170.1, 169.4, 0.7, 0.77],
]
