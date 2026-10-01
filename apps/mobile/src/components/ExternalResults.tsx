import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Caption, Eyebrow, MAX_SCALE, Segmented } from '@/components/ui'
import { useT } from '@/lib/i18n'
import type { ExternalSuggestion, SearchWhere } from '@/lib/types'

// The "En Google" list, shared by Explore and the rank flow's find step. Tapping
// a row creates the place (the hook owns that); this is presentational, plus the
// scope pills — how far Google is asked to look: Santo Domingo, the Dominican
// Republic, or the world. The list is always in that order whatever the scope;
// the pills only decide how far down it goes. They stay for as long as there is
// a search, even one that found nothing, so a narrow scope can be widened again.
// "Powered by Google" is required off-map by Google's ToS — swap for the official
// logo asset before a real launch. Ported from apps/app/src/components/
// ExternalResults.tsx.
export function ExternalResults({
  heading,
  suggestions,
  creatingId,
  onPick,
  where,
  onWhere,
  active,
  nothingFound,
}: {
  heading?: ReactNode
  suggestions: ExternalSuggestion[]
  creatingId: string | null
  onPick: (placeId: string) => void
  where: SearchWhere
  onWhere: (where: SearchWhere) => void
  // There is a search to show (3+ characters), and whether Google itself came back empty.
  active: boolean
  nothingFound: boolean
}) {
  const t = useT()
  if (!active) return null
  const busy = creatingId !== null
  const whereLabel: Record<SearchWhere, string> = {
    sd: t('external.where_sd'),
    do: t('external.where_do'),
    world: t('external.where_world'),
  }
  return (
    <View>
      {heading ?? <Eyebrow className="pb-1 pt-4">{t('external.on_google')}</Eyebrow>}
      <Segmented<SearchWhere>
        accessibilityLabel={t('external.where_label')}
        value={where}
        onChange={onWhere}
        options={(['sd', 'do', 'world'] as const).map((w) => ({ value: w, label: whereLabel[w] }))}
        className="mb-1 mt-1"
      />
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
        <Caption className="py-3 text-meta">
          {where === 'world'
            ? t('external.none')
            : t('external.nothing_in', { where: whereLabel[where] })}
        </Caption>
      ) : null}
    </View>
  )
}
