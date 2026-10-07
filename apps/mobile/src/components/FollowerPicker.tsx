import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { type FocusEvent, Pressable, Text, View } from 'react-native'

import { PersonRow } from '@/components/PersonRow'
import { Caption, EmptyState, ErrorState, RowsSkeleton, MAX_SCALE } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { SearchIcon } from '@/components/ui/icons'
import { api } from '@/lib/api'
import { tapLight } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import type { FollowUser } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// Invite picker for Planes (M3): a follower list with a select/deselect pill —
// invitees are always the host's own followers (a decision made up front, see
// the plan doc), so this is the one screen that reads GET /social/followers.
// Shared by plans/new's "who" step and plans/invite (inviting more people
// to an existing plan): `selected`/`onToggle` are caller-owned so this holds
// no mutation of its own, and `exclude` drops ids already invited. `onToggle`
// hands back the whole FollowUser (not just an id) — plans/new's review
// step needs each invitee's name/avatar, and re-fetching them from an id set
// after the fact would just be this same list again. Renders its rows plain
// (no internal ScrollView) — both callers already scroll the step that hosts
// this. Redesign 2: a search field with its glyph, and a pill per row — a raised "Invite", a
// solid ink "Invited".
export function FollowerPicker({
  selected,
  onToggle,
  exclude,
  onSearchFocus,
}: {
  selected: Set<string>
  onToggle: (user: FollowUser) => void
  exclude?: Set<string>
  // The search field was focused — the page uses it to bring the field to the top (lib/bringToTop.ts).
  onSearchFocus?: (e: FocusEvent) => void
}) {
  const t = useT()
  const lift = useLift()
  const [q, setQ] = useState('')
  const followers = useQuery({
    queryKey: ['followers'],
    queryFn: () => api.get<{ users: FollowUser[] }>('/social/followers'),
  })

  const pool = useMemo(() => {
    const all = followers.data?.users ?? []
    return exclude ? all.filter((u) => !exclude.has(u.id)) : all
  }, [followers.data, exclude])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return pool
    return pool.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) || (u.handle ?? '').toLowerCase().includes(needle),
    )
  }, [pool, q])

  if (followers.isPending) return <RowsSkeleton />
  if (followers.isError) {
    return (
      <ErrorState onRetry={() => followers.refetch()}>{t('plans.followers_load_error')}</ErrorState>
    )
  }
  if (pool.length === 0) {
    return (
      <EmptyState body={t('plans.no_followers_body')}>{t('plans.no_followers_title')}</EmptyState>
    )
  }

  return (
    <View>
      <Field
        icon={<SearchIcon size={18} color="text-muted" />}
        value={q}
        onChangeText={setQ}
        placeholder={t('plans.search_placeholder')}
        onFocus={onSearchFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <View className="mt-2">
        {rows.length === 0 ? (
          <Caption className="mt-4 text-center">{t('plans.no_match', { q })}</Caption>
        ) : (
          rows.map((u) => (
            <PersonRow
              key={u.id}
              user={u}
              right={
                <Pressable
                  hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected.has(u.id) }}
                  onPress={() => {
                    tapLight()
                    onToggle(u)
                  }}
                  className={`min-h-[34px] justify-center rounded-pill px-4 active:opacity-70 ${
                    selected.has(u.id) ? 'bg-ink' : 'bg-chip'
                  }`}
                  style={selected.has(u.id) ? undefined : lift}
                >
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className={`font-ui-semibold text-label ${
                      selected.has(u.id) ? 'text-on-ink' : 'text-text'
                    }`}
                  >
                    {selected.has(u.id) ? t('plans.invited_pill') : t('plans.invite_pill')}
                  </Text>
                </Pressable>
              }
            />
          ))
        )}
      </View>
    </View>
  )
}
