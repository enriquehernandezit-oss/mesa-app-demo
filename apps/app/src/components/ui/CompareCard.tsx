import { displayScore } from '../../lib/display'
import { PlaceCover } from './PlaceCover'
import { Characteristics } from './patterns'
import './compare-card.css'

// The photo-topped comparison card shared by the rank flow's "Which was better?"
// (B2) and onboarding's "Which do you like more?" (G2). A warm-veiled photo over
// paper, the name + characteristics, an optional subline ("new to your list" /
// "#4 on your list"), and — for an already-ranked incumbent — its score circle.
export interface CompareCardItem {
  id: string
  name: string
  cuisine: string | null
  neighborhood: string | null
  coverImageId?: string | null
  priceTier?: number | null
}

export function CompareCard({
  item,
  subline,
  score,
  onClick,
}: {
  item: CompareCardItem
  subline?: string | null
  score?: number | null
  onClick?: () => void
}) {
  return (
    <button type="button" className="cmp-card" onClick={onClick}>
      <PlaceCover
        seed={item.id}
        name={item.name}
        coverImageId={item.coverImageId}
        size={{ w: 700, h: 340 }}
        className="cmp-card__photo"
        imgProps={{
          // Keyed by the cover id: a new opponent is a brand-new <img> node,
          // so the previous photo can never linger under the new name while
          // this one decodes — it fades in on its own once loaded instead.
          key: item.coverImageId ?? item.id,
          className: 'cmp-card__img',
          decoding: 'async',
          ref: (el) => {
            if (el?.complete) el.setAttribute('data-loaded', 'true')
          },
          onLoad: (e) => e.currentTarget.setAttribute('data-loaded', 'true'),
        }}
      />
      <div className="cmp-card__body">
        <div className="cmp-card__main">
          <div className="cmp-card__name">{item.name}</div>
          <Characteristics
            priceTier={item.priceTier}
            cuisine={item.cuisine}
            neighborhood={item.neighborhood}
          />
          {subline && <div className="cmp-card__sub">{subline}</div>}
        </div>
        {score != null && <div className="cmp-card__score">{displayScore(score)}</div>}
      </div>
    </button>
  )
}
