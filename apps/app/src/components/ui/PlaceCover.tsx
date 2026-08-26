import type { ImgHTMLAttributes, ReactNode, Ref } from 'react'
import { cloudinaryUrl } from '../../lib/media'
import './place-cover.css'

// FNV-1a (32-bit) — deterministic per seed, so the same place always draws the
// same mark (seeded by id/slug, not name, so a rename never changes it). Same
// idea as Avatar.tsx's hueFor: hash a string, index into a small fixed set.
function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Six hairline editorial marks — stroke only (--accent is text/glyph only,
// never a fill), standing in for a photo rather than reading as a stock icon.
const MARKS: ReactNode[] = [
  <circle key="0" cx="140" cy="70" r="46" />,
  <g key="1">
    <line x1="28" y1="30" x2="150" y2="150" />
    <line x1="168" y1="36" x2="66" y2="180" />
  </g>,
  <g key="2">
    <circle cx="80" cy="120" r="30" />
    <circle cx="120" cy="90" r="30" />
  </g>,
  <g key="3">
    <line x1="26" y1="70" x2="174" y2="70" />
    <line x1="26" y1="100" x2="174" y2="100" />
    <line x1="26" y1="130" x2="174" y2="130" />
  </g>,
  <rect key="4" x="55" y="55" width="90" height="90" transform="rotate(45 100 100)" />,
  <g key="5">
    <line x1="20" y1="20" x2="20" y2="100" />
    <line x1="20" y1="20" x2="100" y2="20" />
    <line x1="20" y1="20" x2="120" y2="120" />
  </g>,
]

export interface PlaceCoverProps {
  seed: string // restaurant id or list slug — anything stable across a rename
  name: string // monogram letter, and the default alt text source
  coverImageId?: string | null
  size?: { w?: number; h?: number }
  className?: string
  alt?: string
  imgProps?: ImgHTMLAttributes<HTMLImageElement> & {
    ref?: Ref<HTMLImageElement>
    key?: string | number
  }
}

// The photo when there's one, else a deterministic generated cover — so the
// catalog never shows a blank box. `className="ph"` always applies: generated
// covers and real photographs must sit in the same optical layer (the veil +
// grain from global.css), or the catalog visibly splits into "real" and
// "filler". See docs/LOCATION_CATALOG_PLAN.md M5.
export function PlaceCover({
  seed,
  name,
  coverImageId,
  size,
  className,
  alt = '',
  imgProps,
}: PlaceCoverProps) {
  const cover = cloudinaryUrl(coverImageId, size)
  const classes = ['ph', className].filter(Boolean).join(' ')
  if (cover) {
    return (
      <div className={classes}>
        <img loading="lazy" {...imgProps} src={cover} alt={alt} />
      </div>
    )
  }
  const initial = name.trim().charAt(0).toUpperCase() || 'M'
  return (
    <div className={classes}>
      <svg
        className="place-cover__mark"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {MARKS[fnv1a(seed) % MARKS.length]}
        <text x="100" y="126" textAnchor="middle" className="place-cover__mono">
          {initial}
        </text>
      </svg>
    </div>
  )
}
