import { Field } from '@/components/ui/Field'
import { FilterGroup } from '@/components/ui/patterns'
import { categoryLabel, groupLabel } from '@/lib/dishCategories'
import { useLanguage, useT } from '@/lib/i18n'
import type { DishCategory, DishGroup } from '@/lib/types'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

// The category picker shared by the rank flow's "Qué pedir" step and the
// dish composer. Inline, not a sheet: `/rank` is a native modal and Mesa's
// own Sheet can't render above one (see components/ui/Sheet.tsx's header),
// and a flat 65-item action sheet would be a scrolling wall anyway — a
// filter field over the taxonomy's 15 groups gets to any category in one
// glance for the common case (the guessed category is usually right) and a
// few keystrokes otherwise.
export function DishCategoryPicker({
  categories,
  groups,
  selected,
  onSelect,
}: {
  categories: DishCategory[]
  groups: DishGroup[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const t = useT()
  const lang = useLanguage()
  const [query, setQuery] = useState('')

  const labeled = useMemo(
    () => categories.map((c) => ({ ...c, label: categoryLabel(c, lang) })),
    [categories, lang],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return labeled
    return labeled.filter((c) => c.label.toLowerCase().includes(needle))
  }, [labeled, query])

  const byGroup = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const cat of filtered) {
      const list = map.get(cat.group) ?? []
      list.push(cat)
      map.set(cat.group, list)
    }
    return map
  }, [filtered])

  return (
    <View className="gap-3">
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={t('dish.category_search_placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {groups.map((g) => {
        const inGroup = byGroup.get(g.id) ?? []
        if (inGroup.length === 0) return null
        return (
          <FilterGroup
            key={g.id}
            label={groupLabel(g, lang)}
            values={inGroup.map((c) => c.id)}
            selected={selected}
            render={(v) => inGroup.find((c) => c.id === v)?.label ?? String(v)}
            onToggle={(v) => onSelect(String(v))}
          />
        )
      })}
    </View>
  )
}
