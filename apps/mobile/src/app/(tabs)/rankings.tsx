import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { HoodCards } from '@/components/list/HoodCards'
import { Podium } from '@/components/list/Podium'
import { RankRow } from '@/components/list/RankRow'
import { SavedDishPair, SavedEventTicket, SavedPlaceRow } from '@/components/list/SavedRows'
import { useTabBarClearance } from '@/components/MesaTabBar'
import {
  Button,
  Caption,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  IconButton,
  MAX_SCALE,
  Segmented,
  Serif,
  Skeleton,
} from '@/components/ui'
import { ShareIcon, SortIcon, TrophyIcon } from '@/components/ui/icons'
import { pickOne, showSheet } from '@/components/ui/Sheet'
import { useProfile } from '@/hooks/useProfile'
import { useResetOnTabPress } from '@/hooks/useResetOnTabPress'
import { api } from '@/lib/api'
import { cuisineLabel, priceLabel, tagLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
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
  | { kind: 'dishes'; key: string; a: SavedDish; b?: SavedDish }
  | { kind: 'event'; key: string; v: EventSummary; i: number }

// Stable references for the "no data yet" case — `data?.field ?? []` would
// otherwise hand these a fresh array every render, defeating memos below.
const EMPTY_RANKINGS: Ranking[] = []
const EMPTY_SAVED_DISHES: SavedDish[] = []

// Your list (M3, Redesign 2): the ranked passport — mine (a podium for the top three, then
// flat rows), saved (places, dishes, events), and by neighborhood. The share-my-list card
// renders via the native view-shot host (shareListCard → ShareCardHost).
export default function RankingsTab() {
  const router = useRouter()
  const t = useT()
  const insets = useSafeAreaInsets()
  const tabBarClearance = useTabBarClearance()
  const indicator = useResolvedTheme() === 'night' ? ('white' as const) : ('black' as const)
  const { tab: tabParam, kind: kindParam } = useLocalSearchParams<{ tab?: string; kind?: string }>()
  const [tab, setTab] = useState<'mine' | 'saved' | 'barrios'>(
    tabParam === 'saved' ? 'saved' : tabParam === 'barrios' ? 'barrios' : 'mine',
  )
  // Saved is split three ways — the places you want to try, dishes, events — behind its own
  // switcher. The member's named lists have their own screen (app/collections/index.tsx,
  // reached from Profile), so this tab is only what you saved.
  const [savedKind, setSavedKind] = useState<SavedKind>(
    kindParam === 'dishes' || kindParam === 'events' ? kindParam : 'restaurants',
  )
  // The tab is a persistent screen, so a later `/rankings?tab=saved` (Profile's "Saved" row)
  // arrives as a param change on an already-mounted screen — useState's initial value alone
  // never saw it.
  useEffect(() => {
    if (tabParam === 'saved' || tabParam === 'barrios' || tabParam === 'mine') setTab(tabParam)
    if (kindParam === 'restaurants' || kindParam === 'dishes' || kindParam === 'events')
      setSavedKind(kindParam)
  }, [tabParam, kindParam])
  const [sort, setSort] = useState<SortKey>('position')
  const [filters, setFilters] = useState<RankingFilters>(NO_FILTERS)
  const me = useProfile(true, 300_000)
  const accent = useColor('accent')

  // Animate a row's position ONLY when it's genuinely removed (swipe-to-remove), not on every
  // sort/filter change (M14) — a layout transition that fires unconditionally makes picking a
  // new filter animate every remaining row sliding into its new spot, which looks like a
  // janky shuffle on a real-size list instead of an instant re-sort. Set to true right before a
  // filter/sort setter runs (read by RankRow during THAT render, passed down as a prop — not
  // read from the ref directly, since only the parent's own render can see the ref's current
  // value synchronously); the no-deps effect below resets it right after that render commits,
  // so it's back to normal (animated) by the time any later, genuine removal happens.
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
  // Prefetched alongside `mine`/`stats` (M14) — no `enabled: tab === 'saved'` gate — so
  // switching to that tab never shows a loading flicker for data that was cheap to have ready.
  const saved = useQuery({
    queryKey: ['saved'],
    queryFn: () => api.get<{ saved: SavedPlace[] }>('/saved'),
  })
  // Guardados (M19) — the "saved" tab's other sections, same prefetch-always posture.
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
  // Sort/filter run over the whole in-memory list (see lib/rankingSort.ts and the comment on
  // GET /rankings). shareList and the neighborhood view still read `ranked` raw — the top-5
  // card and the neighborhood aggregate are about the real list, not the current view.
  const filterOptions = useMemo(() => deriveFilterOptions(ranked), [ranked])
  const activeCount = activeFilterCount(filters)
  const processed = useMemo(
    () => sortRankings(applyFilters(ranked, filters), sort),
    [ranked, filters, sort],
  )
  // The podium is the head of the list in its own order, unfiltered — sorted or filtered, the
  // top three of a view aren't "your top three", so every row is a plain row.
  const showPodium = sort === 'position' && activeCount === 0 && processed.length > 0
  const rows = useMemo(() => (showPodium ? processed.slice(3) : processed), [showPodium, processed])
  const wide = ranked.length >= 100

  const openSort = async () => {
    const options = sortOptions()
    const idx = await showSheet({
      title: t('rankings.sort_by'),
      options: options.map((o) => ({ label: o.label })),
      selectedIndex: options.findIndex((o) => o.key === sort),
    })
    if (idx != null) setSortAnimated(options[idx].key)
  }

  // One dropdown pill per dimension (M14), same pattern as Explore's — a set filter shows its
  // own value on the pill ("Piantini ▾"). pickOne is the shared bottom-sheet chooser.
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

  // The share-my-list story card (the growth loop): the top 5, over the top spot's photo,
  // captioned with the public profile link.
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

  // The title, the stats trio and the tab switcher, rendered ONCE above the three containers
  // rather than inside each one's header. Injected into all three, there'd be three live copies
  // of the switcher bound to one value — and the two hidden ones sit under `display:'none'`, so
  // Yoga skips their layout and they measure width 0, which Segmented reads as "no thumb yet".
  // Tapping would slide the copy you touched for about a frame, hide it, and reveal a
  // never-measured copy that snaps its thumb into place. One continuously-mounted instance is
  // the only way the slide survives a switch. The trade is that this block no longer scrolls
  // away with the list — the founder's call, taken knowingly for the smoother switch.
  const topMatter = (
    <View style={{ paddingTop: insets.top + 4 }} className="px-5">
      <View className="flex-row items-end justify-between gap-3">
        <Serif
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className="shrink text-display text-text"
        >
          {t('rankings.title')}
        </Serif>
        <View className="flex-row gap-2">
          <IconButton
            accessibilityLabel={t('nav.leaderboard')}
            onPress={() => router.push('/leaderboard')}
            icon={<TrophyIcon size={18} color="text" />}
          />
          {ranked.length > 0 && (
            <IconButton
              accessibilityLabel={t('rankings.share_my_list')}
              onPress={shareList}
              icon={<ShareIcon size={18} color="text" />}
            />
          )}
        </View>
      </View>

      {!stats.isError && (
        // Rendered while loading too (with — placeholders) rather than only once stats.data
        // lands, so the trio reserves its space instead of the whole header jumping down the
        // instant the request settles. Only hidden on a genuine error, where there's nothing
        // honest to show. Each is a real control: it names a destination that has a screen.
        <View className="mb-4 mt-3 flex-row gap-[30px]">
          <ListStat
            n={stats.data ? String(stats.data.places) : '—'}
            l={t('rankings.places')}
            onPress={() => setTab('mine')}
          />
          <ListStat
            n={stats.data ? String(stats.data.saved) : '—'}
            l={t('rankings.saved_tab')}
            onPress={() => setTab('saved')}
          />
          <ListStat
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
    </View>
  )

  // Sort + filter — the "mine" tab only, and only once there's a list to act on. One dropdown
  // pill per dimension, each opening a bottom-sheet chooser.
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
          <Caption className="font-ui-semibold text-accent">{t('rankings.clear')}</Caption>
        </Pressable>
      )}
    </ChipRail>
  )

  // Stable across renders (M14) — a NEW renderItem function on every render of this screen
  // makes FlatList treat every mounted cell as changed, re-rendering all of them regardless of
  // whether RankRow itself (wrapped in memo) would have bailed out. skipLayoutAnimRef is a
  // stable ref object, so its live .current value is still read fresh on every actual
  // invocation even though the callback itself never changes identity.
  const renderRankingRow = useCallback(
    ({ item }: { item: Ranking }) => (
      <RankRow ranking={item} skipAnim={skipLayoutAnimRef.current} wide={wide} />
    ),
    [wide],
  )
  const savedDishes = savedDishesQuery.data?.saved ?? EMPTY_SAVED_DISHES
  const savedItems: SavedItem[] = useMemo(() => {
    if (savedKind === 'restaurants')
      return (saved.data?.saved ?? []).map((v) => ({ kind: 'place', key: v.restaurant.id, v }))
    if (savedKind === 'dishes') {
      // Two to a row: a grid of photos, kept inside the one list.
      const pairs: SavedItem[] = []
      for (let i = 0; i < savedDishes.length; i += 2) {
        const a = savedDishes[i]
        if (a) pairs.push({ kind: 'dishes', key: a.dish.id, a, b: savedDishes[i + 1] })
      }
      return pairs
    }
    return (savedEventsQuery.data?.events ?? []).map((v, i) => ({
      kind: 'event',
      key: v.id,
      v,
      i,
    }))
  }, [savedKind, saved.data, savedDishes, savedEventsQuery.data])
  const renderSavedItem = useCallback(({ item }: { item: SavedItem }) => {
    if (item.kind === 'place') return <SavedPlaceRow saved={item.v} />
    if (item.kind === 'dishes') return <SavedDishPair a={item.a} b={item.b} />
    return <SavedEventTicket e={item.v} index={item.i} />
  }, [])
  const activeSaved =
    savedKind === 'restaurants'
      ? saved
      : savedKind === 'dishes'
        ? savedDishesQuery
        : savedEventsQuery

  // Three refs, not one (M23) — Mine/Saved/Neighborhoods are three ALWAYS-mounted lists (see
  // below), so a tab-bar press has to know which one is actually visible right now and scroll
  // only that one. Neighborhoods has no query of its own; it's `mine`'s data regrouped, so it
  // reloads the same source. All three do a silent refetch, not Mine's own onRefresh: flipping
  // RefreshControl's `refreshing` on programmatically (not from an actual pull) shifts the
  // scroll offset down to reveal the spinner and doesn't reliably restore it
  // (usePullToRefresh's own header), which raced the scrollToOffset below and left a tab
  // re-press landing scrolled down instead of at the top. A real pull-to-refresh gesture on
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

  // Nothing to show under the head: still loading, failed, no list yet, or a filter that
  // matches nothing. (With a podium but no rows beneath it — a list of three — there IS a list,
  // so no empty state.)
  const mineEmpty =
    processed.length > 0 ? null : mine.isPending ? (
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
          <Button size="sm" variant="secondary" onPress={() => setFiltersAnimated(NO_FILTERS)}>
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

  return (
    <View className="flex-1 bg-bg">
      {topMatter}
      {/* Three persistent containers, shown/hidden via style.display instead of a
          `tab === X ? <A/> : <B/>` ternary (M14) — the ternary swaps FlatList for ScrollView on
          every tab switch, which is a different element TYPE each side, so React unmounted and
          remounted the whole thing (losing scroll position, re-flickering ListEmptyComponent) on
          every single tap. All three stay mounted; only the active one is visible. */}
      <FlatList
        ref={mineListRef}
        style={{ display: tab === 'mine' ? 'flex' : 'none' }}
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={renderRankingRow}
        // Bounded windows (perf pass). These lists stay mounted while hidden, so a hidden one
        // renders only its initial batch and then expands to the default 21-screenful window
        // the moment it's revealed — a burst of ReanimatedSwipeable rows landing on the main
        // thread exactly during the switch. A screenful of buffer either side is enough for a
        // list this size.
        windowSize={5}
        maxToRenderPerBatch={5}
        initialNumToRender={8}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
        ListHeaderComponent={
          <>
            {mineControls || null}
            {showPodium ? <Podium items={processed.slice(0, 3)} /> : null}
          </>
        }
        ListEmptyComponent={mineEmpty}
        indicatorStyle={indicator}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      />
      {/* Saved — prefetched alongside `mine`/`stats` (no `enabled: tab === 'saved'` gate) so
          it's already there the instant this tab becomes visible, and virtualized (a real
          FlatList, not a ScrollView.map) now that a save-heavy member's list can run long. */}
      <FlatList
        ref={savedListRef}
        style={{ display: tab === 'saved' ? 'flex' : 'none' }}
        data={savedItems}
        keyExtractor={(it) => `${it.kind}-${it.key}`}
        renderItem={renderSavedItem}
        // Same bounded window as the list above, same reason.
        windowSize={5}
        maxToRenderPerBatch={5}
        initialNumToRender={8}
        ListHeaderComponent={
          <Segmented
            className="mb-3.5"
            value={savedKind}
            onChange={setSavedKind}
            options={[
              { value: 'restaurants', label: t('rankings.saved_restaurants') },
              { value: 'dishes', label: t('rankings.saved_dishes_tab') },
              { value: 'events', label: t('rankings.saved_events_tab') },
            ]}
          />
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
        <HoodCards
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

// One of the three numbers under the title: the figure in the serif over its label, left-aligned.
function ListStat({ n, l, onPress }: { n: string; l: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[44px] justify-center active:opacity-70"
    >
      <Text
        style={DATA_FIGURES}
        maxFontSizeMultiplier={MAX_SCALE}
        className="font-serif text-serif-xl text-text"
      >
        {n}
      </Text>
      <Caption numberOfLines={1} className="text-micro">
        {l}
      </Caption>
    </Pressable>
  )
}
