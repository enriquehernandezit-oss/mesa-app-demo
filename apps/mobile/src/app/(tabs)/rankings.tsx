import { useTabBarClearance } from '@/components/MesaTabBar'
import { TopBar } from '@/components/TopBar'
import {
  Button,
  Caption,
  Chip,
  EmptyState,
  ErrorState,
  Eyebrow,
  Skeleton,
  Title,
} from '@/components/ui'
import { KeyboardDone } from '@/components/ui/KeyboardDone'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { showSheet } from '@/components/ui/Sheet'
import { ShareIcon, SortIcon } from '@/components/ui/icons'
import { Characteristics, FilterGroup, ScoreBadge, Stat } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { api } from '@/lib/api'
import { cuisineLabel, displayScore, priceLabel, tagLabel } from '@/lib/display'
import { tapLight } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { cloudinaryUrl } from '@/lib/media'
import { removeRankingWithUndo } from '@/lib/rankingRemoval'
import {
  NO_FILTERS,
  type RankingFilters,
  type SortKey,
  activeFilterCount,
  applyFilters,
  deriveFilterOptions,
  filterChipLabel,
  sortLabel,
  sortOptions,
  sortRankings,
} from '@/lib/rankingSort'
import { shareListCard } from '@/lib/shareCardStore'
import { profileShareText } from '@/lib/shareProfile'
import type { MeStats, Ranking, SavedPlace } from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { DATA_FIGURES } from '@/theme/vars'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, { LinearTransition } from 'react-native-reanimated'

// The ranked passport (M3) — mine (ordered, serif numerals, brass scores, notes),
// want-to-try (saved), and by-sector. Ported from apps/app/src/screens/tabs/
// RankingsTab.tsx. The share-my-list card renders via the native view-shot host
// (shareListCard → ShareCardHost).
export default function RankingsTab() {
  const router = useRouter()
  const t = useT()
  const tabBarClearance = useTabBarClearance()
  const indicator = useResolvedTheme() === 'candlelit' ? ('white' as const) : ('black' as const)
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>()
  const [tab, setTab] = useState<'mine' | 'saved' | 'barrios'>(
    tabParam === 'saved' ? 'saved' : tabParam === 'barrios' ? 'barrios' : 'mine',
  )
  const [sort, setSort] = useState<SortKey>('position')
  const [filters, setFilters] = useState<RankingFilters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const me = useProfile(true, 300_000)
  const accent = useColor('accent')

  const mine = useQuery({
    queryKey: ['rankings'],
    queryFn: () => api.get<{ rankings: Ranking[] }>('/rankings'),
  })
  const saved = useQuery({
    queryKey: ['saved'],
    queryFn: () => api.get<{ saved: SavedPlace[] }>('/saved'),
    enabled: tab === 'saved',
  })
  const stats = useQuery({ queryKey: ['me-stats'], queryFn: () => api.get<MeStats>('/me/stats') })

  const ranked = mine.data?.rankings ?? []
  // Sort/filter run over the whole in-memory list (see lib/rankingSort.ts and
  // the comment on GET /rankings). shareList and BarriosView still read `ranked`
  // raw — the top-5 card and the sector aggregate are about the real list, not
  // the current view.
  const filterOptions = useMemo(() => deriveFilterOptions(ranked), [ranked])
  const activeCount = activeFilterCount(filters)
  const processed = useMemo(
    () => sortRankings(applyFilters(ranked, filters), sort),
    [ranked, filters, sort],
  )

  const openSort = async () => {
    const options = sortOptions()
    const idx = await showSheet({
      title: t('rankings.sort_by'),
      options: options.map((o) => ({ label: o.label })),
      selectedIndex: options.findIndex((o) => o.key === sort),
    })
    if (idx != null) setSort(options[idx].key)
  }

  // The share-my-list story card (the growth loop): the top 5, over the top
  // spot's photo, captioned with the public profile link.
  const profile = me.data?.profile
  const firstName = (profile?.name ?? '').split(' ')[0] || 'Mi'
  const shareList = () =>
    shareListCard({
      eyebrow: `${firstName} · top ${Math.min(ranked.length, 5)}`,
      subtitle: [profile?.neighborhood?.name, 'Santo Domingo'].filter(Boolean).join(' · '),
      items: ranked
        .slice(0, 5)
        .map((r) => ({ position: r.position, name: r.restaurant.name, score: r.score })),
      coverUrl: cloudinaryUrl(ranked[0]?.restaurant.coverImageId, { w: 1080, h: 780 }),
      text: profileShareText(profile?.handle),
    })

  // Shared across all three tabs — the title, the stats trio, the tab switcher.
  const topMatter = (
    <>
      <View className="flex-row items-start justify-between">
        <View>
          <Eyebrow>{t('settings.your_list')}</Eyebrow>
          <Title className="mb-3">{t('rankings.title')}</Title>
        </View>
        {ranked.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('rankings.share_my_list')}
            onPress={shareList}
            className="h-10 w-10 items-center justify-center rounded-pill border border-line active:opacity-70"
          >
            <ShareIcon size={18} />
          </Pressable>
        )}
      </View>

      {!stats.isError && (
        // Rendered while loading too (with — placeholders) rather than only
        // once stats.data lands, so the trio reserves its space instead of the
        // whole header jumping down the instant the request settles. Only
        // hidden on a genuine error, where there's nothing honest to show.
        // "prom." (your own average score — the least actionable of the three
        // numbers here) is now "Quiero probar", the saved-places count, which
        // is a real destination (the tab right next to this one).
        <View className="mb-4 flex-row gap-6">
          <Stat
            n={stats.data ? String(stats.data.places) : '—'}
            l={t('rankings.places')}
            onPress={() => setTab('mine')}
          />
          <Stat
            n={stats.data ? String(stats.data.saved) : '—'}
            l={t('rankings.want_to_try_stat')}
            onPress={() => setTab('saved')}
          />
          <Stat
            n={stats.data && stats.data.streakWeeks > 0 ? String(stats.data.streakWeeks) : '—'}
            l={t('rankings.streak_weeks')}
            onPress={() => router.push('/leaderboard')}
          />
        </View>
      )}

      <View className="mb-4 flex-row gap-2">
        <Chip state={tab === 'mine' ? 'selected' : 'default'} onPress={() => setTab('mine')}>
          {t('rankings.mine_tab')}
        </Chip>
        <Chip state={tab === 'saved' ? 'selected' : 'default'} onPress={() => setTab('saved')}>
          {t('restaurant.want_to_try_label')}
        </Chip>
        <Chip state={tab === 'barrios' ? 'selected' : 'default'} onPress={() => setTab('barrios')}>
          {t('rankings.sectors_tab')}
        </Chip>
      </View>
    </>
  )

  // Sort + filter — the "mine" tab only, and only once there's a list to act on.
  const mineControls = ranked.length > 0 && (
    <View className="mb-4 gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Chip size="sm" icon={<SortIcon size={12} />} chevron onPress={openSort}>
          {sortLabel(sort)}
        </Chip>
        <Chip
          size="sm"
          state={filterOpen ? 'active' : activeCount > 0 ? 'selected' : 'default'}
          chevron
          onPress={() => setFilterOpen((v) => !v)}
        >
          {activeCount > 0
            ? t('rankings.filters_count', { n: activeCount })
            : t('rankings.filters')}
        </Chip>
        {filters.sector && (
          <Chip
            size="sm"
            state="selected"
            onPress={() => setFilters((f) => ({ ...f, sector: null }))}
          >
            {filterChipLabel('sector', filters.sector)} ✕
          </Chip>
        )}
        {filters.occasion && (
          <Chip
            size="sm"
            state="selected"
            onPress={() => setFilters((f) => ({ ...f, occasion: null }))}
          >
            {filterChipLabel('occasion', filters.occasion)} ✕
          </Chip>
        )}
        {filters.price != null && (
          <Chip
            size="sm"
            state="selected"
            onPress={() => setFilters((f) => ({ ...f, price: null }))}
          >
            {filterChipLabel('price', filters.price)} ✕
          </Chip>
        )}
        {filters.cuisine && (
          <Chip
            size="sm"
            state="selected"
            onPress={() => setFilters((f) => ({ ...f, cuisine: null }))}
          >
            {filterChipLabel('cuisine', filters.cuisine)} ✕
          </Chip>
        )}
        {activeCount > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setFilters(NO_FILTERS)}
            className="min-h-[36px] justify-center px-1 active:opacity-60"
          >
            <Caption className="font-ui-semibold text-accent-strong">{t('rankings.clear')}</Caption>
          </Pressable>
        )}
      </View>

      {filterOpen && (
        <View className="gap-3 rounded border border-line bg-surface p-3">
          <FilterGroup
            label={t('rank.sector')}
            values={filterOptions.sectors}
            selected={filters.sector}
            render={(v) => String(v)}
            onToggle={(v) =>
              setFilters((f) => ({ ...f, sector: f.sector === v ? null : String(v) }))
            }
          />
          <FilterGroup
            label={t('rankings.occasion_label')}
            values={filterOptions.occasions}
            selected={filters.occasion}
            render={(v) => tagLabel(String(v))}
            onToggle={(v) =>
              setFilters((f) => ({ ...f, occasion: f.occasion === v ? null : String(v) }))
            }
          />
          <FilterGroup
            label={t('rankings.price_label')}
            values={filterOptions.prices}
            selected={filters.price}
            render={(v) => priceLabel(Number(v)) ?? String(v)}
            onToggle={(v) => setFilters((f) => ({ ...f, price: f.price === v ? null : Number(v) }))}
          />
          <FilterGroup
            label={t('rankings.cuisine_label')}
            values={filterOptions.cuisines}
            selected={filters.cuisine}
            render={(v) => cuisineLabel(String(v)) ?? String(v)}
            onToggle={(v) =>
              setFilters((f) => ({ ...f, cuisine: f.cuisine === v ? null : String(v) }))
            }
          />
        </View>
      )}
    </View>
  )

  return (
    <View className="flex-1 bg-bg">
      <TopBar variant="discover" />
      {/* The "mine" tab is the one genuinely unbounded list, and every row mounts
          a gesture handler — so it's the one that earns a FlatList. saved and
          barrios stay ScrollViews (bounded / an aggregate). */}
      {tab === 'mine' ? (
        <FlatList
          data={processed}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <RankingRow ranking={item} />}
          refreshControl={
            <RefreshControl
              refreshing={mine.isRefetching}
              onRefresh={() => mine.refetch()}
              tintColor={accent}
            />
          }
          ListHeaderComponent={
            <>
              {topMatter}
              {mineControls}
            </>
          }
          ListEmptyComponent={
            mine.isPending ? (
              <View className="gap-3">
                <Skeleton height={72} />
                <Skeleton height={72} />
                <Skeleton height={72} />
              </View>
            ) : mine.isError ? (
              <ErrorState onRetry={() => mine.refetch()}>{t('rankings.load_error')}</ErrorState>
            ) : activeCount > 0 ? (
              <EmptyState
                body={t('rankings.no_filter_matches')}
                action={
                  <Button size="sm" variant="secondary" onPress={() => setFilters(NO_FILTERS)}>
                    {t('rankings.clear_filters')}
                  </Button>
                }
              >
                {t('rankings.nothing_matches')}
              </EmptyState>
            ) : (
              <EmptyState
                body={t('rankings.empty_body')}
                action={
                  <Button size="sm" variant="primary" onPress={() => router.push('/rank')}>
                    {t('rankings.rank_a_spot')}
                  </Button>
                }
              >
                {t('rankings.empty_title')}
              </EmptyState>
            )
          }
          indicatorStyle={indicator}
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        />
      ) : (
        <ScrollView
          indicatorStyle={indicator}
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
        >
          {topMatter}
          {tab === 'barrios' ? (
            <BarriosView
              rankings={ranked}
              onSelectSector={(sector) => {
                setFilters({ ...NO_FILTERS, sector })
                setTab('mine')
              }}
            />
          ) : saved.isPending ? (
            <Skeleton height={64} />
          ) : saved.isError ? (
            <ErrorState onRetry={() => saved.refetch()}>
              {t('rankings.saved_load_error')}
            </ErrorState>
          ) : saved.data && saved.data.saved.length > 0 ? (
            saved.data.saved.map((s) => <SavedRow key={s.restaurant.id} saved={s} />)
          ) : (
            <EmptyState
              body={t('rankings.saved_empty_body')}
              action={
                <Button size="sm" variant="secondary" onPress={() => router.push('/explore')}>
                  {t('rankings.explore_spots')}
                </Button>
              }
            >
              {t('rankings.saved_empty_title')}
            </EmptyState>
          )}
        </ScrollView>
      )}
    </View>
  )
}

// A row that reveals a single "Quitar" action on a left swipe — the iOS gesture
// for removing something from a list. It's additive: the inline text actions
// stay, because they also carry note-editing and are the discoverable path.
// Removal itself is unchanged (the existing undo-toast machinery owns the
// optimistic remove + restore); the swipe is a second trigger for it.
function SwipeToRemove({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
  const ref = useRef<SwipeableMethods>(null)
  const t = useT()
  return (
    // layout= makes a removal slide the neighbours up rather than teleporting
    // them — it matters right after a swipe, and again when undo puts the row back.
    // layout= makes a removal slide its neighbours up instead of teleporting
    // them — which matters most right after a swipe, and again on undo.
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('rankings.remove')}
          onPress={() => {
            // Close first: the row is removed optimistically, and a half-open
            // swipeable left behind reads as a stuck row.
            ref.current?.close()
            onRemove()
          }}
          className="w-[88px] items-center justify-center bg-status-packed active:opacity-80"
        >
          <Text className="font-ui-medium text-label text-on-accent">{t('rankings.remove')}</Text>
        </Pressable>
      )}
    >
      <Animated.View layout={LinearTransition.springify().damping(18)}>{children}</Animated.View>
    </ReanimatedSwipeable>
  )
}

function RankingRow({ ranking }: { ranking: Ranking }) {
  const queryClient = useQueryClient()
  const placeholder = useColor('text-muted')
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ranking.note ?? '')

  const saveNote = useMutation({
    mutationFn: () => api.patch(`/rankings/${ranking.id}/note`, { body: draft.trim() }),
    onSuccess: () => {
      tapLight()
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['rankings'] })
    },
    onError: () =>
      toast({
        variant: 'error',
        message: t('rankings.note_save_error'),
        action: { label: t('common.retry'), onClick: () => saveNote.mutate() },
      }),
  })

  return (
    <SwipeToRemove onRemove={() => removeRankingWithUndo(ranking)}>
      <View className="flex-row gap-3 border-b border-line py-3">
        <Text className="font-serif text-serif-lg text-accent" style={{ width: 28 }}>
          {ranking.position}
        </Text>
        <Link href={`/r/${ranking.restaurant.id}`}>
          <PlaceCover
            seed={ranking.restaurant.id}
            name={ranking.restaurant.name}
            coverImageId={ranking.restaurant.coverImageId}
            size={{ w: 160, h: 160 }}
            className="h-14 w-14"
          />
        </Link>
        <View className="flex-1">
          {/* Name + characteristics + Pide/tags is one tap target now — it
              used to be three islands (a Link around just the name, then
              dead space over Characteristics and the Pide/tags line) with no
              visible seam telling you where the tappable part stopped. */}
          <Link href={`/r/${ranking.restaurant.id}`} asChild>
            <Pressable accessibilityRole="button" className="active:opacity-80">
              <Text className="font-serif text-serif-md text-text">{ranking.restaurant.name}</Text>
              <Characteristics
                priceTier={ranking.restaurant.priceTier}
                cuisine={ranking.restaurant.cuisine}
                neighborhood={ranking.neighborhood}
              />
              {(ranking.favoriteDish || (ranking.tags?.length ?? 0) > 0) && !editing && (
                <View className="mt-1 flex-row flex-wrap items-center gap-2">
                  {ranking.favoriteDish && (
                    <Caption className="text-text-2">
                      {t('rankings.order_this', { dish: ranking.favoriteDish })}
                    </Caption>
                  )}
                  {(ranking.tags ?? []).map((t) => (
                    <Caption key={t} className="text-micro">
                      {tagLabel(t)}
                    </Caption>
                  ))}
                </View>
              )}
            </Pressable>
          </Link>
          {editing ? (
            <View className="mt-2 gap-2">
              <TextInput
                className="min-h-[64px] rounded border border-line bg-surface p-3 font-ui text-body text-text"
                placeholderTextColor={placeholder}
                placeholder={t('rankings.note_placeholder')}
                maxLength={140}
                multiline
                inputAccessoryViewID="ranking-note"
                value={draft}
                onChangeText={setDraft}
              />
              <View className="flex-row gap-4">
                <ActionText disabled={saveNote.isPending} onPress={() => saveNote.mutate()}>
                  {t('rankings.save')}
                </ActionText>
                <ActionText
                  onPress={() => {
                    setDraft(ranking.note ?? '')
                    setEditing(false)
                  }}
                >
                  {t('common.cancel')}
                </ActionText>
              </View>
            </View>
          ) : (
            <>
              {ranking.note ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setEditing(true)}
                  className="active:opacity-70"
                >
                  <SerifNote>{ranking.note}</SerifNote>
                </Pressable>
              ) : null}
              {/* "Quitar" used to sit here too, permanently equal-billed with
                  the primary action — a destructive action doesn't need a
                  second entry point when the row already swipes to remove
                  (SwipeToRemove, above). */}
              <View className="mt-2">
                <ActionText onPress={() => setEditing(true)}>
                  {ranking.note ? t('rankings.edit_note') : t('rankings.add_note')}
                </ActionText>
              </View>
            </>
          )}
        </View>
        <Link href={`/rank?restaurant=${ranking.restaurant.id}`} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('restaurant.rank_again_label')}
          >
            <ScoreBadge size="sm" score={ranking.score} attribution={{ kind: 'stated' }} />
          </Pressable>
        </Link>
      </View>
    </SwipeToRemove>
  )
}

function SerifNote({ children }: { children: React.ReactNode }) {
  return <Text className="mt-1 font-serif-italic text-serif-sm text-text-2">“{children}”</Text>
}

function ActionText({
  children,
  onPress,
  danger,
  disabled,
}: { children: React.ReactNode; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="min-h-[44px] justify-center active:opacity-60"
    >
      <Text
        className={`font-ui text-eyebrow uppercase tracking-eyebrow ${danger ? 'text-status-packed' : 'text-text-muted'}`}
      >
        {children}
      </Text>
    </Pressable>
  )
}

function BarriosView({
  rankings,
  onSelectSector,
}: { rankings: Ranking[]; onSelectSector: (sector: string) => void }) {
  const router = useRouter()
  const t = useT()
  // Keyed by the RAW neighborhood (nullable), not the display fallback — the
  // filter system (lib/rankingSort.ts) matches `filters.sector` against
  // `r.neighborhood` directly, so a bar's tap payload has to be that same raw
  // value. The one bucket with no real neighborhood ("Santo Domingo") stays
  // inert: there's no filter value that means "unset."
  const byHood = new Map<string | null, { count: number; sum: number }>()
  for (const r of rankings) {
    const cur = byHood.get(r.neighborhood) ?? { count: 0, sum: 0 }
    byHood.set(r.neighborhood, { count: cur.count + 1, sum: cur.sum + r.score })
  }
  const hoods = [...byHood.entries()]
    .map(([neighborhood, v]) => ({
      neighborhood,
      name: neighborhood ?? 'Santo Domingo',
      count: v.count,
      avg: v.sum / v.count,
    }))
    .sort((a, b) => b.count - a.count)
  const max = hoods[0]?.count ?? 1
  if (hoods.length === 0)
    return (
      <EmptyState
        action={
          <Button size="sm" variant="primary" onPress={() => router.push('/rank')}>
            {t('rankings.rank_a_spot')}
          </Button>
        }
      >
        {t('rankings.barrios_empty_body')}
      </EmptyState>
    )
  return (
    <View className="gap-4">
      {hoods.map((h) => {
        const bar = (
          <>
            <View className="flex-row items-baseline justify-between">
              <Text className="font-serif text-serif-md text-text">{h.name}</Text>
              <Caption>
                {h.count} · {t('rank.avg_abbrev')}{' '}
                <Text style={DATA_FIGURES} className="text-accent">
                  {displayScore(h.avg)}
                </Text>
              </Caption>
            </View>
            <View className="mt-1 h-1 rounded-pill bg-bg-sunk">
              <View
                className="h-1 rounded-pill bg-accent-fill"
                style={{ width: `${(h.count / max) * 100}%` }}
              />
            </View>
          </>
        )
        if (!h.neighborhood) return <View key={h.name}>{bar}</View>
        return (
          <Pressable
            key={h.name}
            accessibilityRole="button"
            onPress={() => onSelectSector(h.neighborhood as string)}
            className="active:opacity-70"
          >
            {bar}
          </Pressable>
        )
      })}
    </View>
  )
}

function SavedRow({ saved }: { saved: SavedPlace }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const t = useT()
  const remove = useMutation({
    mutationFn: () => api.del(`/saved/${saved.restaurant.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved'] }),
    onError: () =>
      toast({
        variant: 'error',
        message: t('restaurant.unsave_error'),
        action: { label: t('common.retry'), onClick: () => remove.mutate() },
      }),
  })
  return (
    <SwipeToRemove onRemove={() => remove.mutate()}>
      <View className="flex-row items-center justify-between border-b border-line py-3">
        <Link href={`/r/${saved.restaurant.id}`} asChild>
          <Pressable accessibilityRole="button" className="flex-1 pr-3 active:opacity-80">
            <Text className="font-serif text-serif-md text-text">{saved.restaurant.name}</Text>
            <Characteristics
              priceTier={saved.restaurant.priceTier}
              cuisine={saved.restaurant.cuisine}
              neighborhood={saved.neighborhood}
            />
          </Pressable>
        </Link>
        <View className="flex-none flex-row items-center gap-3">
          <Button
            variant="secondary"
            className="w-auto min-h-[40px] px-4"
            onPress={() => router.push(`/rank?restaurant=${saved.restaurant.id}`)}
          >
            {t('rankings.rank_button')}
          </Button>
          <ActionText danger disabled={remove.isPending} onPress={() => remove.mutate()}>
            {remove.isPending ? t('rankings.removing') : t('rankings.remove')}
          </ActionText>
        </View>
      </View>
    </SwipeToRemove>
  )
}
