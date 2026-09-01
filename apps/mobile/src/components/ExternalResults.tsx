import { Caption, SectionHeader } from '@/components/ui'
import type { ExternalSuggestion } from '@/lib/types'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

// The "En Google" list, shared by Explore and the rank flow's find step. Tapping
// a row creates the place (the hook owns that); this is purely presentational.
// "Powered by Google" is required off-map by Google's ToS — swap for the official
// logo asset before a real launch. Ported from apps/app/src/components/
// ExternalResults.tsx.
export function ExternalResults({
  heading,
  suggestions,
  creatingId,
  onPick,
}: {
  heading?: ReactNode
  suggestions: ExternalSuggestion[]
  creatingId: string | null
  onPick: (placeId: string) => void
}) {
  if (suggestions.length === 0) return null
  const busy = creatingId !== null
  return (
    <View>
      {heading ?? <SectionHeader>En Google</SectionHeader>}
      {suggestions.map((s) => {
        const pending = creatingId === s.providerPlaceId
        return (
          <Pressable
            key={s.providerPlaceId}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onPick(s.providerPlaceId)}
            className="border-line border-b py-3 active:opacity-70"
          >
            <Text className="font-serif text-serif-sm text-text">{s.name}</Text>
            {pending || s.secondaryText ? (
              <Caption className="mt-0.5">{pending ? 'Creando perfil…' : s.secondaryText}</Caption>
            ) : null}
          </Pressable>
        )
      })}
      <Caption className="mt-2 text-text-faint">Powered by Google</Caption>
    </View>
  )
}
