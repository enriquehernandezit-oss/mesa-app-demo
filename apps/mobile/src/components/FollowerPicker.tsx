import { PersonRow } from '@/components/PersonRow'
import { Caption, EmptyState, ErrorState, RowsSkeleton } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { tapLight } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import type { FollowUser } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

// Invite picker for Planes (M3): a follower list with a select/deselect pill —
// invitees are always the host's own followers (a decision made up front, see
// the plan doc), so this is the one screen that reads GET /social/followers.
// Shared by planes/nuevo's "who" step and planes/invitar (inviting more people
// to an existing plan): `selected`/`onToggle` are caller-owned so this holds
// no mutation of its own, and `exclude` drops ids already invited. `onToggle`
// hands back the whole FollowUser (not just an id) — planes/nuevo's review
// step needs each invitee's name/avatar, and re-fetching them from an id set
// after the fact would just be this same list again. Renders its rows plain
// (no internal ScrollView) — both callers already scroll the step that hosts
// this.
export function FollowerPicker({
  selected,
  onToggle,
  exclude,
}: {
  selected: Set<string>
  onToggle: (user: FollowUser) => void
  exclude?: Set<string>
}) {
  const t = useT()
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
        value={q}
        onChangeText={setQ}
        placeholder={t('plans.search_placeholder')}
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
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected.has(u.id) }}
                  onPress={() => {
                    tapLight()
                    onToggle(u)
                  }}
                  className={`min-h-[36px] justify-center rounded-pill border px-4 active:opacity-70 ${
                    selected.has(u.id) ? 'border-accent bg-accent-fill' : 'border-line'
                  }`}
                >
                  <Text
                    className={`font-mono text-eyebrow ${
                      selected.has(u.id) ? 'text-accent-strong' : 'text-text-muted'
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
