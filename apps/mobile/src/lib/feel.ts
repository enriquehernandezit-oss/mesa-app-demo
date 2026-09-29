// The maths behind "How was it?": the three-stop slider and the flute that answers it. Pure —
// no React Native, no Reanimated imports — so it is unit-tested with the other lib/*.test.ts.
// Every function that runs per frame carries the 'worklet' directive, so Reanimated can call
// it on the UI thread; under plain JS (the tests) the directive is just a string.
import type { Sentiment } from './pairwise'

// The slider's three stops, worst to best. A `level` is a continuous 0–2 position between them
// while a finger drags; a `Stop` is the one it settles on.
export type Stop = 0 | 1 | 2
export const STOP_SENTIMENT: readonly Sentiment[] = ['disliked', 'fine', 'loved']

export function clamp(v: number, lo: number, hi: number): number {
  'worklet'
  return v < lo ? lo : v > hi ? hi : v
}

// The stop a level is closest to (a halfway level rounds up, toward "loved").
export function nearestStop(level: number): Stop {
  'worklet'
  return Math.round(clamp(level, 0, 2)) as Stop
}

export function levelToSentiment(level: number): Sentiment {
  return STOP_SENTIMENT[nearestStop(level)] ?? 'fine'
}

export function sentimentToStop(s: Sentiment): Stop {
  return s === 'loved' ? 2 : s === 'disliked' ? 0 : 1
}

// How visible the answer word for `stop` is at `level`: full on its stop, gone by halfway to the
// next, so as the slider moves one word fades out and the next fades in with a beat between.
export function wordOpacity(level: number, stop: number): number {
  'worklet'
  return clamp(1 - 2 * Math.abs(level - stop), 0, 1)
}

// A value that eases between three stop values as the level moves between them — the flute's
// layers use this to crossfade (flat → thin stream → lively).
export function levelValue(level: number, at0: number, at1: number, at2: number): number {
  'worklet'
  const l = clamp(level, 0, 2)
  return l <= 1 ? at0 + (at1 - at0) * l : at1 + (at2 - at1) * (l - 1)
}

// ── The bubbles ──────────────────────────────────────────────────────────────

// Where a bubble is in its trip, 0 up to (not including) 1: `now` seconds on the clock, a trip
// takes `dur`, and it began `delay` seconds into one (so a stream is already full at t = 0).
export function bubblePhase(now: number, dur: number, delay: number): number {
  'worklet'
  const p = (now + delay) / dur
  return p - Math.floor(p)
}

// cubic-bezier(.45, 0, .9, .6) — the design's rise curve: a bubble lingers at the bottom, then
// speeds up as it climbs. Solved for y at a given x (time), by Newton's method with a bisection
// fallback; the control points are fixed, so this needs no closure to run as a worklet.
export function riseEase(x: number): number {
  'worklet'
  if (x <= 0) return 0
  if (x >= 1) return 1
  const cx = 3 * 0.45
  const bx = 3 * (0.9 - 0.45) - cx
  const ax = 1 - cx - bx
  const cy = 0
  const by = 3 * 0.6 - cy
  const ay = 1 - cy - by
  let t = x
  for (let i = 0; i < 8; i++) {
    const err = ((ax * t + bx) * t + cx) * t - x
    if (Math.abs(err) < 1e-6) return ((ay * t + by) * t + cy) * t
    const slope = (3 * ax * t + 2 * bx) * t + cx
    if (Math.abs(slope) < 1e-6) break
    t -= err / slope
  }
  let lo = 0
  let hi = 1
  t = x
  for (let i = 0; i < 24; i++) {
    const v = ((ax * t + bx) * t + cx) * t
    if (Math.abs(v - x) < 1e-6) break
    if (v < x) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return ((ay * t + by) * t + cy) * t
}

// One bubble's drawing state at a phase: how far up it is (0–1 of its `rise`), how big (it grows
// from .55 to 1.25 as it climbs) and how visible (in over the first tenth, out over the last).
export function bubbleFrame(phase: number): { lift: number; scale: number; opacity: number } {
  'worklet'
  const e = riseEase(phase)
  const opacity =
    phase < 0.1 ? riseEase(phase / 0.1) : phase > 0.88 ? 1 - riseEase((phase - 0.88) / 0.12) : 1
  return { lift: e, scale: 0.55 + 0.7 * e, opacity }
}

// The fizz over the rim breathes between .15 and .8 on a 1.8 s beat.
export function twinkleOpacity(now: number, delay: number): number {
  'worklet'
  const p = bubblePhase(now, 1.8, delay)
  return 0.15 + 0.65 * (0.5 - 0.5 * Math.cos(2 * Math.PI * p))
}
