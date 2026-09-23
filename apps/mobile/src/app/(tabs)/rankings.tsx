import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

import { EventTicket, useNow } from '@/components/events/EventTicket'
import { useTabBarClearance } from '@/components/MesaTabBar'
import { TopBar } from '@/components/TopBar'
import {
  Button,
  Caption,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  Eyebrow,
  MAX_SCALE,
  Segmented,
  Skeleton,
  Title,
} from '@/components/ui'
import { MoreIcon, ShareIcon, SortIcon } from '@/components/ui/icons'
import { Characteristics, Stat } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { pickOne, showSheet } from '@/components/ui/Sheet'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { useResetOnTabPress } from '@/hooks/useResetOnTabPress'
import { api } from '@/lib/api'
import { cuisineLabel, displayScore, priceLabel, tagLabel } from '@/lib/display'
import { tapLight } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
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
import type { EventSummary, MeStats, Ranking, SavedDish, SavedPlace } from '@/lib/types'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { DATA_FIGURES } from '@/theme/vars'

type SavedKind = 'restaurants' | 'dishes' | 'events'
type SavedItem =
  | { kind: 'place'; key: string; v: SavedPlace }
  | { kind: 'dish'; key: string; v: SavedDish }
  | { kind: 'event'; key: string; v: EventSummary; i: number }

// A saved event is the same ticket card as in Explore, so its bookmark and
// "I'm going" work right here; the countdown keeps its own minute tick.
function SavedEventTicket({ e, index }: { e: EventSummary; index: number }) {
  const now = useNow()
  return <EventTicket e={e} index={index} now={now} />
}

// Stable references for the "no data yet" case — `data?.field ?? []` would
// otherwise hand these a fresh array every render, defeating memos below.
const EMPTY_RANKINGS: Ranking[] = []
const EMPTY_SAVED_DISHES: SavedDish[] = []

// The ranked passport (M3) — mine (ordered, serif numerals, brass scores, notes),
// want-to-try (saved), and by-sector. Ported from apps/app/src/screens/tabs/
// RankingsTab.tsx. The share-my-list card renders via the native view-shot host
// (shareListCard → ShareCardHost).
export default function RankingsTab() {
  const router = useRouter()
  const t = useT()
  const tabBarClearance = useTabBarClearance()
  const indicator = useResolvedTheme() === 'candlelit' ? ('white' as const) : ('black' as const)
  const { tab: tabParam, kind: kindParam } = useLocalSearchParams<{ tab?: string; kind?: string }>()
  const [tab, setTab] = useState<'mine' | 'saved' | 'barrios'>(
    tabParam === 'saved' ? 'saved' : tabParam === 'barrios' ? 'barrios' : 'mine',
  )
  // Saved is split three ways — the places you want to try, dishes, events —
  // behind its own sliding switcher. The member's named lists used to sit
  // above it in a rail; they have their own screen now (app/collections/
  // index.tsx, reached from Profile) so this tab is only what you saved.
  const [savedKind, setSavedKind] = useState<SavedKind>(
    kindParam === 'dishes' || kindParam === 'events' ? kindParam : 'restaurants',
  )
  // The tab is a persistent screen, so a later `/rankings?tab=saved` (Profile's
  // "Saved" row) arrives as a param change on an already-mounted screen —
  // useState's initial value alone never saw it.
  useEffect(() => {
    if (tabParam === 'saved' || tabParam === 'barrios' || tabParam === 'mine') setTab(tabParam)
    if (kindParam === 'restaurants' || kindParam === 'dishes' || kindParam === 'events')
      setSavedKind(kindParam)
  }, [tabParam, kindParam])
  const [sort, setSort] = useState<SortKey>('position')
  const [filters, setFilters] = useState<RankingFilters>(NO_FILTERS)
  const me = useProfile(true, 300_000)
  const accent = useColor('accent')

  // Animate a row's position ONLY when it's genuinely removed (swipe-to-
  // remove), not on every sort/filter change (M14) — SwipeToRemove's layout
  // transition used to fire unconditionally, so picking a new filter animated
  // every remaining row sliding into its new spot, which looks like a janky
  // shuffle on a real-size list instead of an instant re-sort. Set to true
  // right before a filter/sort setter runs (read by RankingRow/SwipeToRemove
  // during THAT render, passed down as a prop — not read from the ref
  // directly, since only the parent's own render can see the ref's current
  // value synchronously); the no-deps effect below resets it right after
  // that render commits, so it's back to normal (animated) by the time any
  // later, genuine removal happens.
  const skipLayoutAnimRef = useRef(false)
  useEffect(() => {
    skipLayoutAnimRef.current = false
  })
  const setSortAnimated: typeof setSort = (next) => {
    skipLayoutAnimRef.current = true
    setSort(next)
  }
  const setFiltersAnimated: typeof setFilters = (next) => {
    skipLayoutAnimRef.current = true
    setFilters(next)
  }

  const mine = useQuery({
    queryKey: ['rankings'],
    queryFn: () => api.get<{ rankings: Ranking[] }>('/rankings'),
  })
  // Prefetched alongside `mine`/`stats` (M14) — no `enabled: tab === 'saved'`
  // gate — so switching to that tab never shows a loading flicker for data
  // that was cheap to have ready already.
  const saved = useQuery({
    queryKey: ['saved'],
    queryFn: () => api.get<{ saved: SavedPlace[] }>('/saved'),
  })
  // Guardados (M19) — the "saved" tab's other sections, same prefetch-
  // always posture as `saved` above.
  const savedDishesQuery = useQuery({
    queryKey: ['saved-dishes'],
    queryFn: () => api.get<{ saved: SavedDish[] }>('/saved/dishes'),
  })
  const savedEventsQuery = useQuery({
    queryKey: ['events', 'saved'],
    queryFn: () => api.get<{ events: EventSummary[] }>('/events/saved'),
    enabled: tab === 'saved',
  })
  const stats = useQuery({ queryKey: ['me-stats'], queryFn: () => api.get<MeStats>('/me/stats') })
  const { refreshing, onRefresh } = usePullToRefresh(mine.refetch)

  const ranked = mine.data?.rankings ?? EMPTY_RANKINGS
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
    if (idx != null) setSortAnimated(options[idx].key)
  }

  // One dedicated dropdown pill per dimension (M14), same pattern as
  // Explore's — replaces the old single "Filtros (N)" trigger + inline
  // FilterGroup panel. pickOne is shared (components/ui/Sheet.tsx).
  async function pickSector() {
    const v = await pickOne(t('rank.sector'), filterOptions.sectors, filters.sector, (s) => s)
    if (v !== undefined) setFiltersAnimated((f) => ({ ...f, sector: v }))
  }
  async function pickOccasion() {
    const v = await pickOne(
      t('rankings.occasion_label'),
      filterOptions.occasions,
      filters.occasion,
      (tag) => tagLabel(tag),
    )
    if (v !== undefined) setFiltersAnimated((f) => ({ ...f, occasion: v }))
  }
  async function pickPrice() {
    const v = await pickOne(t('rankings.price_label'), filterOptions.prices, filters.price, (p) => {
      return priceLabel(p) ?? String(p)
    })
    if (v !== undefined) setFiltersAnimated((f) => ({ ...f, price: v }))
  }
  async function pickCuisine() {
    const v = await pickOne(
      t('rankings.cuisine_label'),
      filterOptions.cuisines,
      filters.cuisine,
      (c) => {
        return cuisineLabel(c) ?? c
      },
    )
    if (v !== undefined) setFiltersAnimated((f) => ({ ...f, cuisine: v }))
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
      coverUrl: imageUrl(ranked[0]?.restaurant.coverImageId, { w: 1080, h: 780 }),
      text: profileShareText(profile?.handle),
    })

  // The title, the stats trio and the tab switcher, rendered ONCE above the
  // three containers rather than inside each one's header. It used to be
  // injected into all three, which meant three live copies of the switcher
  // bound to one value — and the two hidden ones sit under `display:'none'`,
  // so Yoga skips their layout and they measure width 0, which Segmented
  // reads as "no thumb yet". Tapping therefore slid the copy you touched for
  // about a frame, hid it, and revealed a never-measured copy that snapped
  // its thumb into place: the slide was real, you just never saw it. One
  // continuously-mounted instance is the only way the animation survives a
  // switch. The trade is that this block no longer scrolls away with the
  // list — the founder's call, taken knowingly for the smoother switch.
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
            l={t('rankings.saved_tab')}
            onPress={() => setTab('saved')}
          />
          <Stat
            n={stats.data && stats.data.streakWeeks > 0 ? String(stats.data.streakWeeks) : '—'}
            l={t('rankings.streak_weeks')}
            onPress={() => router.push('/leaderboard')}
          />
        </View>
      )}

      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'mine', label: t('rankings.mine_tab') },
          { value: 'saved', label: t('rankings.saved_tab') },
          { value: 'barrios', label: t('rankings.sectors_tab') },
        ]}
      />
    </>
  )

  // Sort + filter — the "mine" tab only, and only once there's a list to act
  // on. One dedicated dropdown pill per dimension (M14) instead of a single
  // "Filtros (N)" trigger + inline panel — a set filter shows its own value
  // directly on the pill ("Piantini ▾").
  const mineControls = ranked.length > 0 && (
    <ChipRail className="mb-4">
      <Chip size="sm" icon={<SortIcon size={12} />} chevron onPress={openSort}>
        {sortLabel(sort)}
      </Chip>
      <Chip size="sm" chevron state={filters.sector ? 'selected' : 'default'} onPress={pickSector}>
        {filters.sector ? filterChipLabel('sector', filters.sector) : t('rank.sector')}
      </Chip>
      <Chip
        size="sm"
        chevron
        state={filters.occasion ? 'selected' : 'default'}
        onPress={pickOccasion}
      >
        {filters.occasion
          ? filterChipLabel('occasion', filters.occasion)
          : t('rankings.occasion_label')}
      </Chip>
      <Chip
        size="sm"
        chevron
        state={filters.price != null ? 'selected' : 'default'}
        onPress={pickPrice}
      >
        {filters.price != null
          ? filterChipLabel('price', filters.price)
          : t('rankings.price_label')}
      </Chip>
      <Chip
        size="sm"
        chevron
        state={filters.cuisine ? 'selected' : 'default'}
        onPress={pickCuisine}
      >
        {filters.cuisine
          ? filterChipLabel('cuisine', filters.cuisine)
          : t('rankings.cuisine_label')}
      </Chip>
      {activeCount > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setFiltersAnimated(NO_FILTERS)}
          className="min-h-[36px] justify-center px-1 active:opacity-60"
        >
          <Caption className="font-ui-semibold text-accent-strong">{t('rankings.clear')}</Caption>
        </Pressable>
      )}
    </ChipRail>
  )

  // Stable across renders (M14) — a NEW renderItem function on every render
  // of this screen used to make FlatList treat every currently-mounted cell
  // as changed, re-rendering all of them regardless of whether RankingRow
  // itself (wrapped in memo, below) would have bailed out. skipLayoutAnimRef
  // is a stable ref object, so its live .current value is still read fresh
  // on every actual invocation even though the callback itself never changes
  // identity.
  const renderRankingRow = useCallback(
    ({ item }: { item: Ranking }) => (
      <RankingRow ranking={item} skipAnim={skipLayoutAnimRef.current} />
    ),
    [],
  )
  const savedDishes = savedDishesQuery.data?.saved ?? EMPTY_SAVED_DISHES
  const savedItems: SavedItem[] = useMemo(() => {
    if (savedKind === 'restaurants')
      return (saved.data?.saved ?? []).map((v) => ({ kind: 'place', key: v.restaurant.id, v }))
    if (savedKind === 'dishes') return savedDishes.map((v) => ({ kind: 'dish', key: v.dish.id, v }))
    return (savedEventsQuery.data?.events ?? []).map((v, i) => ({
      kind: 'event',
      key: v.id,
      v,
      i,
    }))
  }, [savedKind, saved.data, savedDishes, savedEventsQuery.data])
  const renderSavedItem = useCallback(({ item }: { item: SavedItem }) => {
    if (item.kind === 'place') return <SavedRow saved={item.v} />
    if (item.kind === 'dish') return <SavedDishRow saved={item.v} />
    return <SavedEventTicket e={item.v} index={item.i} />
  }, [])
  const activeSaved =
    savedKind === 'restaurants'
      ? saved
      : savedKind === 'dishes'
        ? savedDishesQuery
        : savedEventsQuery

  // Three refs, not one (M23) — Mine/Saved/Barrios are three ALWAYS-mounted
  // lists (see the comment above on why), so a tab-bar press has to know
  // which one is actually visible right now and scroll only that one.
  // Barrios has no query of its own; it's `mine`'s data regrouped, so it
  // reloads the same source. All three do a silent refetch, not Mine's own
  // onRefresh: flipping RefreshControl's `refreshing` on programmatically
  // (not from an actual pull) shifts the scroll offset down to reveal the
  // spinner and doesn't reliably restore it (usePullToRefresh's own header),
  // which raced the scrollToOffset below and left a tab re-press landing
  // scrolled down instead of at the top. A real pull-to-refresh gesture on
  // Mine is untouched — only this synthetic trigger skips the spinner.
  const mineListRef = useRef<FlatList<Ranking>>(null)
  const savedListRef = useRef<FlatList<SavedItem>>(null)
  const barriosScrollRef = useRef<ScrollView>(null)
  useResetOnTabPress(
    useCallback(() => {
      if (tab === 'mine') {
        mineListRef.current?.scrollToOffset({ offset: 0, animated: true })
        void mine.refetch()
      } else if (tab === 'saved') {
        savedListRef.current?.scrollToOffset({ offset: 0, animated: true })
        void activeSaved.refetch()
      } else {
        barriosScrollRef.current?.scrollTo({ y: 0, animated: true })
        void mine.refetch()
      }
    }, [tab, activeSaved, mine]),
  )

  return (
    <View className="flex-1 bg-bg">
      <TopBar variant="discover" />
      <View className="px-5">{topMatter}</View>
      {/* Three persistent containers, shown/hidden via style.display instead
          of a `tab === X ? <A/> : <B/>` ternary (M14) — the ternary used to
          swap FlatList for ScrollView on every tab switch, which is a
          different element TYPE each side, so React unmounted and remounted
          the whole thing (losing scroll position, re-flickering
          ListEmptyComponent) on every single Mía/Quiero probar/Sectores tap.
          All three stay mounted now; only the active one is visible. */}
      <FlatList
        ref={mineListRef}
        style={{ display: tab === 'mine' ? 'flex' : 'none' }}
        data={processed}
        keyExtractor={(r) => r.id}
        renderItem={renderRankingRow}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
        ListHeaderComponent={mineControls || null}
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
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => setFiltersAnimated(NO_FILTERS)}
                >
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
      {/* Saved — prefetched alongside `mine`/`stats` (no `enabled: tab ===
          'saved'` gate) so it's already there the instant this tab becomes
          visible, and virtualized (a real FlatList, not a ScrollView.map)
          now that a save-heavy member's list can run long. */}
      <FlatList
        ref={savedListRef}
        style={{ display: tab === 'saved' ? 'flex' : 'none' }}
        data={savedItems}
        keyExtractor={(it) => `${it.kind}-${it.key}`}
        renderItem={renderSavedItem}
        ListHeaderComponent={
          <>
            <Segmented
              className="mt-2 mb-3"
              value={savedKind}
              onChange={setSavedKind}
              options={[
                { value: 'restaurants', label: t('rankings.saved_restaurants') },
                { value: 'dishes', label: t('rankings.saved_dishes_tab') },
                { value: 'events', label: t('rankings.saved_events_tab') },
              ]}
            />
          </>
        }
        ListEmptyComponent={
          activeSaved.isPending ? (
            <Skeleton height={64} />
          ) : activeSaved.isError ? (
            <ErrorState onRetry={() => activeSaved.refetch()}>
              {savedKind === 'events'
                ? t('rankings.saved_events_error')
                : t('rankings.saved_load_error')}
            </ErrorState>
          ) : savedKind === 'dishes' ? (
            <EmptyState>{t('rankings.no_saved_dishes')}</EmptyState>
          ) : savedKind === 'events' ? (
            <EmptyState
              body={t('rankings.no_saved_events_body')}
              action={
                <Button size="sm" variant="secondary" onPress={() => router.push('/explore')}>
                  {t('rankings.browse_events')}
                </Button>
              }
            >
              {t('rankings.no_saved_events')}
            </EmptyState>
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
          )
        }
        indicatorStyle={indicator}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      />
      <ScrollView
        ref={barriosScrollRef}
        style={{ display: tab === 'barrios' ? 'flex' : 'none' }}
        indicatorStyle={indicator}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
      >
        <BarriosView
          rankings={ranked}
          onSelectSector={(sector) => {
            setFiltersAnimated({ ...NO_FILTERS, sector })
            setTab('mine')
          }}
        />
      </ScrollView>
    </View>
  )
}

// Hoisted (M14), not built fresh on every row's every render — a
// LinearTransition config is a plain object either way, but re-creating it
// per row per render is needless churn on a list that can run long.
const ROW_LAYOUT_TRANSITION = LinearTransition.springify().damping(18)

// A row that reveals a single "Quitar" action on a left swipe — the iOS gesture
// for removing something from a list. It's additive: the inline text actions
// stay, because they also carry note-editing and are the discoverable path.
// Removal itself is unchanged (the existing undo-toast machinery owns the
// optimistic remove + restore); the swipe is a second trigger for it.
function SwipeToRemove({
  onRemove,
  skipAnim,
  children,
}: {
  onRemove: () => void
  skipAnim?: boolean
  children: ReactNode
}) {
  const ref = useRef<SwipeableMethods>(null)
  const t = useT()
  return (
    // layout= makes a removal slide the neighbours up rather than teleporting
    // them — it matters right after a swipe, and again when undo puts the row back.
    // layout= makes a removal slide its neighbours up instead of teleporting
    // them — which matters most right after a swipe, and again on undo.
    // Skipped (M14) when the caller says this render is a filter/sort change,
    // not a removal — see skipLayoutAnimRef's comment above for why.
    <ReanimatedSwipeable
      ref={ref}
      // Rows are separate white cards now (not hairline-divided), so the gap
      // between them lives here — on the swipeable itself, so the red action
      // revealed behind a card is exactly that card's height.
      containerStyle={{ marginBottom: 8 }}
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
          className="ml-2 w-[88px] items-center justify-center rounded-card bg-status-packed active:opacity-80"
        >
          <Text className="font-ui-medium text-label text-on-accent">{t('rankings.remove')}</Text>
        </Pressable>
      )}
    >
      <Animated.View layout={skipAnim ? undefined : ROW_LAYOUT_TRANSITION}>
        {children}
      </Animated.View>
    </ReanimatedSwipeable>
  )
}

const RankingRow = memo(function RankingRow({
  ranking,
  skipAnim,
}: {
  ranking: Ranking
  skipAnim?: boolean
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
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

  // One line of meta (cuisine · neighborhood · price) and one accent line
  // (what you ordered, else your first occasion tag) — the founder's mock.
  // Characteristics' two stacked lines plus a permanent "Agregar nota" row
  // made every card ~130pt tall; this keeps it to the photo's height.
  const meta = [
    cuisineLabel(ranking.restaurant.cuisine),
    ranking.neighborhood,
    priceLabel(ranking.restaurant.priceTier),
  ]
    .filter(Boolean)
    .join(' · ')
  const accentLine = ranking.favoriteDish
    ? t('rankings.order_this', { dish: ranking.favoriteDish })
    : ranking.tags?.[0]
      ? tagLabel(ranking.tags[0])
      : null

  // The "···" menu — note editing, re-rank and remove, which used to be a
  // permanent text-action row under every card (and a swipe, which stays).
  async function openMenu() {
    const i = await showSheet({
      title: ranking.restaurant.name,
      options: [
        { label: ranking.note ? t('rankings.edit_note') : t('rankings.add_note') },
        { label: t('restaurant.rank_again_label') },
        { label: t('rankings.remove'), destructive: true },
      ],
    })
    if (i === 0) setEditing(true)
    else if (i === 1) router.push(`/rank?restaurant=${ranking.restaurant.id}`)
    else if (i === 2) removeRankingWithUndo(ranking)
  }

  return (
    <SwipeToRemove onRemove={() => removeRankingWithUndo(ranking)} skipAnim={skipAnim}>
      <View className="rounded-card border border-line bg-surface py-2.5 pr-1 pl-2">
        <View className="flex-row items-center gap-2.5">
          {/* Wide enough for "100", never wraps: a 20pt column stacked
              "1" over "0" for every position past 9. */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1.1}
            style={[DATA_FIGURES, { width: 26 }]}
            className={`text-center font-serif text-serif-md ${ranking.position <= 3 ? 'text-text' : 'text-text-faint'}`}
          >
            {ranking.position}
          </Text>
          <Link href={`/r/${ranking.restaurant.id}`} asChild>
            <Pressable
              accessibilityRole="button"
              className="flex-1 flex-row items-center gap-2.5 active:opacity-80"
            >
              <PlaceCover
                seed={ranking.restaurant.id}
                name={ranking.restaurant.name}
                coverImageId={ranking.restaurant.coverImageId}
                size={{ w: 160, h: 160 }}
                className="h-12 w-12 rounded-sm"
              />
              <View className="flex-1 justify-center">
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-semibold text-subhead text-text"
                >
                  {ranking.restaurant.name}
                </Text>
                {meta ? (
                  <Caption numberOfLines={1} className="mt-[1px]">
                    {meta}
                  </Caption>
                ) : null}
                {accentLine ? (
                  <Caption
                    numberOfLines={1}
                    className="mt-[1px] font-ui-semibold text-accent-strong"
                  >
                    {accentLine}
                  </Caption>
                ) : null}
              </View>
            </Pressable>
          </Link>
          {/* The score — a solid brass circle, the one filled shape in the
              row, so it's the first thing the eye lands on. */}
          <View className="h-11 w-11 items-center justify-center rounded-pill bg-accent-fill">
            <Text
              style={DATA_FIGURES}
              maxFontSizeMultiplier={1.1}
              className="font-serif text-serif-sm text-on-accent"
            >
              {displayScore(ranking.score)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('rankings.more_actions')}
            onPress={openMenu}
            hitSlop={8}
            className="h-11 w-7 items-center justify-center active:opacity-60"
          >
            <MoreIcon size={18} color="text-muted" />
          </Pressable>
        </View>
        {editing ? (
          <View className="mt-2 gap-1 pr-2 pl-8">
            <TextInput
              autoFocus
              className="min-h-[64px] rounded border border-line bg-bg p-3 font-ui text-body text-text"
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
        ) : null}
      </View>
    </SwipeToRemove>
  )
})

function ActionText({
  children,
  onPress,
  danger,
  disabled,
}: {
  children: React.ReactNode
  onPress: () => void
  danger?: boolean
  disabled?: boolean
}) {
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
}: {
  rankings: Ranking[]
  onSelectSector: (sector: string) => void
}) {
  const router = useRouter()
  const t = useT()
  // Keyed by the RAW neighborhood (nullable), not the display fallback — the
  // filter system (lib/rankingSort.ts) matches `filters.sector` against
  // `r.neighborhood` directly, so a bar's tap payload has to be that same raw
  // value. The one bucket with no real neighborhood ("Santo Domingo") stays
  // inert: there's no filter value that means "unset." Memoized (M14): this
  // screen re-renders on every filter/sort/tab change, none of which touch
  // `rankings` itself, so recomputing the aggregate from scratch each time
  // was pure waste.
  const hoods = useMemo(() => {
    const byHood = new Map<string | null, { count: number; sum: number }>()
    for (const r of rankings) {
      const cur = byHood.get(r.neighborhood) ?? { count: 0, sum: 0 }
      byHood.set(r.neighborhood, { count: cur.count + 1, sum: cur.sum + r.score })
    }
    return [...byHood.entries()]
      .map(([neighborhood, v]) => ({
        neighborhood,
        name: neighborhood ?? 'Santo Domingo',
        count: v.count,
        avg: v.sum / v.count,
      }))
      .sort((a, b) => b.count - a.count)
  }, [rankings])
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

const SavedRow = memo(function SavedRow({ saved }: { saved: SavedPlace }) {
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
      <View className="flex-row items-center justify-between rounded-card border border-line bg-surface px-4 py-3">
        <Link href={`/r/${saved.restaurant.id}`} asChild>
          <Pressable accessibilityRole="button" className="flex-1 pr-3 active:opacity-80">
            <Text numberOfLines={1} className="font-serif text-serif-md text-text">
              {saved.restaurant.name}
            </Text>
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
})

const SavedDishRow = memo(function SavedDishRow({ saved }: { saved: SavedDish }) {
  const queryClient = useQueryClient()
  const t = useT()
  const remove = useMutation({
    mutationFn: () => api.del(`/saved/dishes/${saved.dish.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-dishes'] }),
    onError: () =>
      toast({
        variant: 'error',
        message: t('save.unsave_error'),
        action: { label: t('common.retry'), onClick: () => remove.mutate() },
      }),
  })
  return (
    <SwipeToRemove onRemove={() => remove.mutate()}>
      <View className="flex-row items-center justify-between border-b border-line py-3">
        <Link href={`/dish/${saved.dish.id}`} asChild>
          <Pressable accessibilityRole="button" className="flex-1 pr-3 active:opacity-80">
            <Text className="font-serif text-serif-md text-text">{saved.dish.name}</Text>
            <Caption className="mt-[2px]">{saved.restaurant.name}</Caption>
          </Pressable>
        </Link>
        <ActionText danger disabled={remove.isPending} onPress={() => remove.mutate()}>
          {remove.isPending ? t('rankings.removing') : t('rankings.remove')}
        </ActionText>
      </View>
    </SwipeToRemove>
  )
})
