import { useState } from 'react'
import { type FocusEvent, View } from 'react-native'

import { Caption, Chip } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { SearchIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'
import { type Sector, shownSectors } from '@/lib/sectorFilter'

// A sector chooser that scales: your choice(s) first, the first few sectors, a search that narrows the
// rest, and "see all". One or many — the caller owns what is selected and what a tap does (one sector:
// replace; favourites: toggle). Used by onboarding, Edit profile and adding a place.
export function SectorPicker({
  sectors,
  selected,
  onToggle,
  size,
  onSearchFocus,
  other,
}: {
  sectors: Sector[]
  selected: ReadonlySet<string>
  onToggle: (slug: string) => void
  size?: 'sm'
  // The search field was focused — the page uses it to bring the field to the top (lib/bringToTop.ts).
  onSearchFocus?: (e: FocusEvent) => void
  // "Otro": an extra chip, always shown, for someone who lives outside the sectors. The caller owns
  // what it means (a field for where they live).
  other?: { selected: boolean; onPress: () => void }
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const { shown, hidden } = shownSectors(sectors, selected, query, expanded)
  // Few sectors need no search; many do.
  const searchable = sectors.length > 8

  return (
    <View className="gap-2.5">
      {searchable ? (
        <Field
          icon={<SearchIcon size={16} color="text-muted" />}
          value={query}
          onChangeText={setQuery}
          placeholder={t('sectors.search_placeholder')}
          onFocus={onSearchFocus}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {shown.map((n) => (
          <Chip
            key={n.slug}
            size={size}
            state={selected.has(n.slug) ? 'selected' : 'default'}
            onPress={() => onToggle(n.slug)}
          >
            {n.name}
          </Chip>
        ))}
        {other ? (
          <Chip size={size} state={other.selected ? 'selected' : 'default'} onPress={other.onPress}>
            {t('sectors.other')}
          </Chip>
        ) : null}
        {hidden > 0 ? (
          <Chip size={size} onPress={() => setExpanded(true)}>
            {t('sectors.see_all', { n: sectors.length })}
          </Chip>
        ) : null}
        {expanded && !query && sectors.length > 8 ? (
          <Chip size={size} onPress={() => setExpanded(false)}>
            {t('sectors.see_less')}
          </Chip>
        ) : null}
      </View>
      {query && shown.length === 0 ? <Caption>{t('sectors.none')}</Caption> : null}
    </View>
  )
}
