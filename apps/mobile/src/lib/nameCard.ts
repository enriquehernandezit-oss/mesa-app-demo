// How big to set a place's name on its name card (components/ui/PlaceCover) — worked out here, from
// the box and the name, rather than left to iOS's shrink-to-fit. That was unreliable: the same
// 26pt name rendered at full size on one card and a few points tall on the next.
//
// The name is the biggest size (from a fifth of the box's short side, 11–28pt) at which it wraps
// into at most three lines that fit inside the box's padding. Instrument Serif runs about 0.4em a
// character; this assumes 0.45 so capitals and wide names never spill.
const EM = 0.45
const SPACE = 0.25
const PAD = 12
const MIN = 9

// Lines the name takes at `size` in a `width`-wide column (greedy word wrap; a word wider than the
// column counts as the lines it would break over).
export function nameCardLines(name: string, size: number, width: number): number {
  if (width <= 0) return Number.POSITIVE_INFINITY
  let lines = 1
  let used = 0
  for (const word of name.split(/\s+/).filter(Boolean)) {
    const w = word.length * EM * size
    if (used === 0) {
      used = w
    } else if (used + SPACE * size + w <= width) {
      used += SPACE * size + w
    } else {
      lines += 1
      used = w
    }
    if (used > width) {
      lines += Math.ceil(used / width) - 1
      used = used % width
    }
  }
  return lines
}

export function nameCardFontSize(name: string, boxW: number, boxH: number): number {
  const base = Math.max(11, Math.min(28, Math.round(Math.min(boxW, boxH) * 0.2)))
  const innerW = boxW - PAD
  const innerH = boxH - PAD
  for (let size = base; size > MIN; size--) {
    const lines = nameCardLines(name, size, innerW)
    if (lines <= 3 && lines * Math.round(size * 1.25) <= innerH) return size
  }
  return MIN
}

// The place page's name on its frosted panel: the biggest size up to `max` at which it wraps into
// at most two lines in a `width`-wide column, given that the text-size setting scales type by
// `scale`. Set from the name rather than by iOS's shrink-to-fit, which on iPhones running iOS 18
// drew this name a few points tall — the same failure the name cards left it for.
const HERO_MIN = 24

export function heroNameSize(name: string, width: number, max: number, scale = 1): number {
  for (let size = max; size > HERO_MIN; size--) {
    if (nameCardLines(name, size * scale, width) <= 2) return size
  }
  return HERO_MIN
}
