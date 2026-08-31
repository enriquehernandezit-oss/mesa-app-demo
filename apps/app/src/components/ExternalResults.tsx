import type { ReactNode } from 'react'
import type { ExternalSuggestion } from '../lib/types'

// The "En Google" list, shared by Explore and the rank flow. Both follow the
// same BEM shape ({block}__row / __name / __meta / __attr) and only differ in
// their block name and heading element, so those are props. Tapping a row
// creates the place (the hook owns that); this is purely presentational.
// "Powered by Google" is required off-map by Google's ToS — swap the text for
// the official logo asset before a real launch.
export function ExternalResults({
  block,
  heading,
  suggestions,
  creatingId,
  onPick,
}: {
  block: 'explore-external' | 'rank-external'
  heading: ReactNode
  suggestions: ExternalSuggestion[]
  creatingId: string | null
  onPick: (placeId: string) => void
}) {
  if (suggestions.length === 0) return null
  const busy = creatingId !== null
  return (
    <div className={block}>
      {heading}
      {suggestions.map((s) => {
        const pending = creatingId === s.providerPlaceId
        return (
          <button
            key={s.providerPlaceId}
            type="button"
            className={`${block}__row`}
            disabled={busy}
            onClick={() => onPick(s.providerPlaceId)}
          >
            <div className={`${block}__name`}>{s.name}</div>
            {(pending || s.secondaryText) && (
              <div className={`${block}__meta`}>
                {pending ? 'Creando perfil…' : s.secondaryText}
              </div>
            )}
          </button>
        )
      })}
      <div className={`${block}__attr`}>Powered by Google</div>
    </div>
  )
}
