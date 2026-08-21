// Phase 6's four shared patterns. Built once here so the screens (M6.5) compose
// them rather than re-implementing. Tokens only; theme-agnostic.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { displayScore, priceLabel } from '../../lib/display'
import { Avatar } from './Avatar'
import './patterns.css'

/* --- Characteristics block ---------------------------------------------------
 * The most-repeated pattern: stacked lines in falling order of usefulness. Every
 * line renders conditionally, so the deferred data (hours, distance) slots in
 * later with NO change here. Occasion tags come first, in brass. */
export interface CharacteristicsProps {
  occasionTags?: string[] | null
  priceTier?: number | null
  cuisine?: string | null
  neighborhood?: string | null
  city?: string | null // appended after the neighbourhood ("Piantini, Santo Domingo")
  hours?: string | null // deferred — renders when the data exists
  distance?: string | null // deferred
  // Social proof line 4: an avatar stack + a label ("2 friends want to try").
  social?: { people: { name: string; image?: string | null }[]; label: string } | null
  className?: string
}
export function Characteristics({
  occasionTags,
  priceTier,
  cuisine,
  neighborhood,
  city,
  hours,
  distance,
  social,
  className,
}: CharacteristicsProps) {
  // Price and cuisine are pipe-separated per the design: "$$$ | Parrilla, Argentine".
  const priceCuisine = [priceLabel(priceTier), cuisine].filter(Boolean).join(' | ')
  // Line 3 folds neighbourhood · distance · hours onto one muted line, per the
  // mocks ("Piantini · 1.2 km · till 1a").
  const place = [[neighborhood, city].filter(Boolean).join(', '), distance, hours]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className={['chars', className].filter(Boolean).join(' ')}>
      {occasionTags && occasionTags.length > 0 && (
        <div className="chars__tags">{occasionTags.join(' · ')}</div>
      )}
      {priceCuisine && <div className="chars__line">{priceCuisine}</div>}
      {place && <div className="chars__line chars__line--muted">{place}</div>}
      {social && social.people.length > 0 && (
        <div className="chars__social">
          <div className="chars__social-avatars">
            {social.people.slice(0, 3).map((p) => (
              <Avatar key={p.name} name={p.name} src={p.image} size={20} />
            ))}
          </div>
          <span className="chars__social-text">{social.label}</span>
        </div>
      )}
    </div>
  )
}

/* --- Badged score circle -----------------------------------------------------
 * A score is ALWAYS attributed, never presented as the place's own rating. The
 * attribution is a required discriminated union, so "whose score is this?" is a
 * type error to omit — the design rule, enforced by the compiler. */
export type ScoreAttribution =
  | { kind: 'you' }
  | { kind: 'user'; label: string } // e.g. "Hers", a first name
  | { kind: 'friends'; count: number } // badge shows the count
  | { kind: 'mesa'; count: number } // all of Mesa

export interface ScoreBadgeProps {
  score: number // 0–100 stored; shown 0–10
  attribution: ScoreAttribution
  size?: 'sm' | 'md' | 'lg'
  caption?: string // 10px ink label under the circle
  sub?: string // mono 8px muted sub-line ("#3 on your list")
}
function badgeText(a: ScoreAttribution): string | null {
  switch (a.kind) {
    case 'you':
      return 'Tú'
    case 'user':
      return a.label
    case 'friends':
      return String(a.count)
    case 'mesa':
      return null // the caption ("All of Mesa") carries the attribution
  }
}
export function ScoreBadge({ score, attribution, size = 'md', caption, sub }: ScoreBadgeProps) {
  const badge = badgeText(attribution)
  // "All of Mesa" reads as a quiet, unbadged, muted number.
  const mesa = attribution.kind === 'mesa'
  return (
    <div className="scorebadge">
      <div
        className={`scorebadge__circle scorebadge__circle--${size}${mesa ? ' scorebadge__circle--mesa' : ''}`}
      >
        <span className="scorebadge__n">{displayScore(score)}</span>
        {badge && <span className="scorebadge__badge">{badge}</span>}
      </div>
      {caption && <span className="scorebadge__caption">{caption}</span>}
      {sub && <span className="scorebadge__sub">{sub}</span>}
    </div>
  )
}

/* --- Outlined utility pill ---------------------------------------------------
 * A small outlined pill with a leading glyph. Renders as <a> when given href,
 * else <button>. Used for Website / Call / Directions / list-membership. */
type PillCommon = { icon?: ReactNode; children: ReactNode; className?: string }
export function UtilityPill({
  icon,
  children,
  className,
  href,
  ...rest
}: PillCommon &
  (
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
    | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
  )) {
  const cls = ['upill', className].filter(Boolean).join(' ')
  const inner = (
    <>
      {icon && <span className="upill__icon">{icon}</span>}
      {children}
    </>
  )
  if (href) {
    return (
      <a className={cls} href={href} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {inner}
    </button>
  )
}
