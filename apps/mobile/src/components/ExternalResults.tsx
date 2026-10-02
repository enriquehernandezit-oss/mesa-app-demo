import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Caption, Eyebrow, MAX_SCALE } from '@/components/ui'
import { useT } from '@/lib/i18n'
import type { ExternalSuggestion } from '@/lib/types'
import { useLocationLabel } from '@/lib/useLocationLabel'

// The "En Google" list, shared by Explore and the rank flow's find step. Tapping
// a row creates the place (the hook owns that); this is purely presentational.
// WHERE Google is asked to look is the location filter (components/LocationFilter),
// shared with Mesa's own results — this list only says so when it found nothing
// there. "Powered by Google" is required off-map by Google's ToS — swap for the
// official logo asset before a real launch. Ported from apps/app/src/components/
// ExternalResults.tsx.
export function ExternalResults({
  heading,
  suggestions,
  creatingId,
  onPick,
  active,
  nothingFound,
}: {
  heading?: ReactNode
  suggestions: ExternalSuggestion[]
  creatingId: string | null
  onPick: (placeId: string) => void
  // There is a search to show (3+ characters), and whether Google itself came back empty.
  active: boolean
  nothingFound: boolean
}) {
  const t = useT()
  const label = useLocationLabel()
  if (!active) return null
  const busy = creatingId !== null
  return (
    <View>
      {heading ?? <Eyebrow className="pb-1 pt-4">{t('external.on_google')}</Eyebrow>}
      {suggestions.map((s) => {
        const pending = creatingId === s.providerPlaceId
        return (
          <Pressable
            key={s.providerPlaceId}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onPick(s.providerPlaceId)}
            className="border-line border-b py-2.5 active:opacity-70"
          >
            <Text maxFontSizeMultiplier={MAX_SCALE} className="font-serif text-serif-xs text-text">
              {s.name}
            </Text>
            {pending || s.secondaryText ? (
              <Caption className="mt-0.5 text-meta">
                {pending ? t('external.creating_profile') : s.secondaryText}
              </Caption>
            ) : null}
          </Pressable>
        )
      })}
      {suggestions.length > 0 ? (
        <Caption className="mt-2.5 text-micro text-text-faint">Powered by Google</Caption>
      ) : nothingFound ? (
        <Caption className="py-3 text-meta">{t('external.nothing_in', { where: label })}</Caption>
      ) : null}
    </View>
  )
}
