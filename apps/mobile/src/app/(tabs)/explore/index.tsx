import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'

import { EventsBrowse } from '@/components/events/EventsBrowse'
import { HitRow } from '@/components/explore/HitRow'
import { MemberRow } from '@/components/explore/MemberRow'
import { TrendingRail } from '@/components/explore/TrendingRail'
import { type ExploreFilterValues, ExploreFilters } from '@/components/ExploreFilters'
import { ExternalResults } from '@/components/ExternalResults'
import { useTabBarClearance } from '@/components/MesaTabBar'
import {
  Button,
  Caption,
  Chip,
  EmptyState,
  ErrorState,
  Eyebrow,
  IconButton,
  MAX_SCALE,
  RowsSkeleton,
  Segmented,
} from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { CloseIcon, MapIcon, SearchIcon, SlidersIcon, SortIcon } from '@/components/ui/icons'
import { pickOne, showSheet } from '@/components/ui/Sheet'
import { useResetOnTabPress } from '@/hooks/useResetOnTabPress'
import { useScrollTopOffset } from '@/hooks/useScrollTopOffset'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { cuisineLabel, tagLabel } from '@/lib/display'
import { t as translate, useLanguage, useT } from '@/lib/i18n'
import type { ExploreHit, ExploreMember, ExploreResponse, Neighborhood } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useExternalPlaceSearch } from '@/lib/useExternalPlaceSearch'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import { useColor } from '@/theme/useColor'

// Explore (Phase 6 mock F1) — searches your circle's rankings, not the open
// internet. Browses top spots by default; a query also returns members and
// dish-matched places. Ported from apps/app/src/screens/explore/
// ExploreScreen.tsx. The QuickActions rail is dropped (same as the feed —
// inert / map-gated).
//
// Filters (D3, then M14): used to be three stacked, unlabelled ChipRails —
// 13+ chips at identical visual weight, mixing sort/open-now/price/sector/
// cuisine with no group headers, which is what read as a "dead band" running
// the width of the screen. D3 collapsed that into one "Filtros (N)" trigger
// + inline panel; M14 replaced THAT with one dedicated dropdown pill per
// dimension (Sector ▾, Cocina ▾, ...), each showing its own value directly
// once set — Rankings' mineControls mirrors this same pill pattern.
type SortKey = 'score' | 'name'

// Stable identities: a fresh [] every render would churn FlatList's own
// diffing and defeat the memos keyed on these.
const NO_HITS: ExploreHit[] = []
const NO_MEMBERS: ExploreMember[] = []

// One key + fetch for the screen's results AND the filter panel's live
// count, so the panel's "Ver N lugares" warms exactly the cache entry the
// screen reads once those filters are applied.
function exploreKey(q: string, f: ExploreFilterValues, openNow: boolean, sort: SortKey) {
  return ['explore', q, f.hood, f.cuisine, f.price, openNow, f.occasion, f.minScore, sort]
}
function fetchExplore(q: string, f: ExploreFilterValues, openNow: boolean, sort: SortKey) {
  const params = new URLSearchParams()
  if (q.length >= 2) params.set('q', q)
  if (f.hood) params.set('neighborhood', f.hood)
  if (f.cuisine) params.set('cuisine', f.cuisine)
  if (f.price) params.set('price', String(f.price))
  if (openNow) params.set('open', '1')
  if (f.occasion) params.set('occasion', f.occasion)
  if (f.minScore) params.set('minScore', String(f.minScore))
  params.set('sort', sort)
  return api.get<ExploreResponse>(`/restaurants?${params}`)
}

// An applied filter, shown on its own in the rail as a solid pill with a small × — tapping it
// drops just that filter.
function RemovablePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useT()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('explore.remove_filter')}: ${label}`}
      onPress={onRemove}
      hitSlop={4}
      className="min-h-[32px] flex-row items-center gap-1.5 rounded-pill bg-ink pl-3.5 pr-2.5 active:scale-[0.97] active:opacity-80"
    >
      <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-label text-on-ink">
        {label}
      </Text>
      <CloseIcon size={12} color="on-ink" strokeWidth={2.4} />
    </Pressable>
  )
}

export default function ExploreScreen() {
  const t = useT()
  const lang = useLanguage()
  const router = useRouter()
  const tabBarClearance = useTabBarClearance()
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'score', label: t('explore.sort_score') },
    { key: 'name', label: t('explore.sort_name') },
  ]
  const accent = useColor('accent')
  const [q, setQ] = useState('')
  // Places/Events (M21) — a view-switcher, the same Segmented control as
  // Rankings' Mine/Saved/Sectors (Mesa's own tokened control, not the
  // native UISegmentedControl: it lives inside a scrolling page, so it's
  // content, not chrome, per CLAUDE.md). Events swaps out everything below it:
  // the filter pills, the trending rail and the Google gap-filler are all
  // Places-only concepts with no events equivalent.
  const [view, setView] = useState<'places' | 'events'>('places')
  const [eventsVisited, setEventsVisited] = useState(false)
  if (view === 'events' && !eventsVisited) setEventsVisited(true)
  // Seeds the filter panel from a deep link — the restaurant profile's
  // neighborhood tap lands here with `?neighborhood=<slug>` already applied,
  // for instance. Read once on mount; the filter chips own the state after
  // that (a later navigation to /explore with new params re-mounts the
  // screen, so this isn't stale).
  const params = useLocalSearchParams<{ neighborhood?: string; cuisine?: string; focus?: string }>()
  const [hood, setHood] = useState<string | null>(params.neighborhood ?? null)
  const [cuisine, setCuisine] = useState<string | null>(params.cuisine ?? null)
  // Feed's search field hands off here with `?focus=1`: put the cursor in ours. `useFocusEffect`,
  // not a plain `useEffect` — Explore is a tab, so it can already be mounted from an earlier visit
  // this session, and an effect keyed on `params.focus` alone would not fire again. Slightly
  // delayed so the screen has finished arriving. `router.setParams` clears the flag once acted on,
  // so revisiting Explore later (via the tab bar) doesn't refocus on a stale param.
  const searchRef = useRef<TextInput>(null)
  useFocusEffect(
    useCallback(() => {
      if (params.focus !== '1') return
      const id = setTimeout(() => {
        searchRef.current?.focus()
        router.setParams({ focus: '' })
      }, 250)
      return () => clearTimeout(id)
    }, [params.focus, router]),
  )
  const [price, setPrice] = useState<number | null>(null)
  const [openNow, setOpenNow] = useState(false)
  const [occasion, setOccasion] = useState<string | null>(null)
  const [minScore, setMinScore] = useState<number | null>(null)
  const [sort, setSort] = useState<SortKey>('score')

  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const cuisines = useQuery({
    queryKey: ['cuisines'],
    queryFn: () => api.get<{ cuisines: string[] }>('/restaurants/cuisines'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  const openSort = async () => {
    const idx = await showSheet({
      title: t('explore.sort_by'),
      options: SORT_OPTIONS.map((o) => ({ label: o.label })),
      selectedIndex: SORT_OPTIONS.findIndex((o) => o.key === sort),
    })
    if (idx != null) setSort(SORT_OPTIONS[idx].key)
  }

  // "Neighborhood ▾": the one filter worth a pill of its own — a bottom-sheet chooser, the same
  // pattern as Your list's. (The rest live in the Filters panel.)
  const pickHood = async () => {
    const list = neighborhoods.data?.neighborhoods ?? []
    const v = await pickOne(
      t('explore.sector'),
      list.map((n) => n.slug),
      hood,
      (slug) => list.find((n) => n.slug === slug)?.name ?? slug,
    )
    if (v !== undefined) setHood(v)
  }

  const [filtersOpen, setFiltersOpen] = useState(false)
  const panelCount = [hood, cuisine, price, occasion, minScore].filter((v) => v != null).length
  const activeCount = panelCount + (openNow ? 1 : 0)
  const clearFilters = useCallback(() => {
    setHood(null)
    setCuisine(null)
    setPrice(null)
    setOpenNow(false)
    setOccasion(null)
    setMinScore(null)
  }, [])

  // Holds off the Mesa search request itself until typing pauses — a request
  // per keystroke used to hit the API (and re-fire the analytics event below)
  // on every character.
  const debouncedQ = useDebounced(q.trim(), 300)

  // Length of the term only, once per settled query — never the term itself
  // (it can be a person's name), and never once per keystroke/refetch.
  useEffect(() => {
    if (debouncedQ.length >= 2) track('search_performed', { length: debouncedQ.length })
  }, [debouncedQ])

  // Default browse: with no query and no filters the API returns the top spots
  // by friends' score, so Explore is never a blank screen.
  const filterValues = { hood, cuisine, price, occasion, minScore }
  const results = useQuery({
    queryKey: exploreKey(debouncedQ, filterValues, openNow, sort),
    queryFn: () => fetchExplore(debouncedQ, filterValues, openNow, sort),
    // Keep the current results up while a new search/filter loads, instead of
    // collapsing the list to a skeleton (and jumping the page) on every change.
    placeholderData: keepPreviousData,
  })

  const { refreshing, onRefresh } = usePullToRefresh(results.refetch)
  // The `?? []` fallbacks reuse stable constants rather than minting a fresh
  // array each render — these feed FlatList's data and the external-search
  // dedupe, both of which key off identity.
  const hits = results.data?.restaurants ?? NO_HITS
  const members = results.data?.members ?? NO_MEMBERS
  // The default browse state: no query, no filters. Anything else is a search,
  // and the trending rail steps out of the way.
  const browsing =
    debouncedQ.length < 2 &&
    !hood &&
    !cuisine &&
    price == null &&
    !openNow &&
    !occasion &&
    minScore == null

  // "Abierto ahora" filters on closesAt (null for imported rows) — hide the chip
  // when few current hits have hours; keep it while active. (M7)
  const hoursCoverage = hits.length ? hits.filter((h) => h.closesAt).length / hits.length : 1
  const showOpenChip = openNow || hoursCoverage >= 0.4

  // Google — any restaurant, Santo Domingo first then the Dominican Republic then the world
  // (the pills under "En Google" narrow that), for every real query, not just the ones
  // Mesa's own catalog misses; tapping one creates a full profile and lands on
  // it. Memoized: the hook normalizes every one of these names to dedupe
  // Google's results against the catalog, and a fresh array each render made it
  // redo the whole pass on every keystroke.
  const catalogNames = useMemo(() => hits.map((h) => h.name), [hits])
  const {
    suggestions,
    inMesa,
    create: createFromGoogle,
    creatingId,
    where,
    setWhere,
    active: googleActive,
    nothingFound,
  } = useExternalPlaceSearch({
    query: q,
    catalogNames: catalogNames,
    onCreated: (restaurant) => router.push(`/r/${restaurant.id}`),
  })
  // A place Google found that Mesa already has (matched by Google's id: "SBG Sophia's Bar & Grill"
  // is Mesa's "Sophia's Bar & Grill") is shown here with Mesa's own results, after the ones Mesa's
  // own search found — not offered again under "En Google" as if it were new.
  const shownHits = useMemo(() => {
    if (inMesa.length === 0) return hits
    const have = new Set(hits.map((h) => h.id))
    return [...hits, ...inMesa.filter((h) => !have.has(h.id))]
  }, [hits, inMesa])

  // The map, as the bar's one action. Memoized (responsiveness audit): written inline, this object
  // got a brand new `headerRight` function on every render — including every keystroke via setQ —
  // and react-native-screens rebuilding the native header button mid-press could drop that tap.
  const headerOptions = useMemo(
    () => ({
      headerRight: () => (
        <IconButton
          accessibilityLabel={translate(lang, 'explore.map_label')}
          onPress={() => router.push('/map')}
          icon={<MapIcon size={18} color="text" />}
        />
      ),
    }),
    [lang, router],
  )

  // Explore is nested one level inside its own Stack (explore/_layout.tsx),
  // so { nested: true } — see the hook's own header for why a plain
  // useNavigation() here would never see the tabPress event at all. One ref
  // still covers both views: they share this list, Events riding in its
  // header and Places as the rows (see the render below).
  const listRef = useRef<FlatList<ExploreHit>>(null)
  // Not offset 0 — the list rests a large-title header lower than that (useScrollTopOffset).
  const topOffset = useScrollTopOffset()
  useResetOnTabPress(
    useCallback(
      (wasActive: boolean) => {
        // Pressing Explore while you are ALREADY on it starts over: no search, no filters, the
        // default sort, the Places view, the widest Google scope, the keyboard away. (Coming
        // from another tab keeps your search — only the scroll position is refreshed.)
        if (wasActive) {
          Keyboard.dismiss()
          setQ('')
          clearFilters()
          setSort('score')
          setView('places')
          setWhere('world')
        }
        listRef.current?.scrollToOffset({ offset: topOffset, animated: true })
        // A silent refetch, not onRefresh(): flipping RefreshControl's
        // `refreshing` on programmatically (not from an actual pull) shifts
        // the scroll offset down to reveal the spinner and doesn't reliably
        // restore it (usePullToRefresh's own header), which raced the
        // scrollTo above and left a tab re-press landing scrolled down
        // instead of at the top. A real pull-to-refresh gesture is untouched
        // — only this synthetic trigger skips the visible spinner.
        void results.refetch()
      },
      [results, topOffset, clearFilters, setWhere],
    ),
    { nested: true },
  )

  const keyExtractor = useCallback((r: ExploreHit) => r.id, [])
  const renderHit = useCallback(
    ({ item, index }: { item: ExploreHit; index: number }) => <HitRow r={item} index={index} />,
    [],
  )

  // Everything that used to sit above the results inside the ScrollView.
  // As a list header it mounts once and stays put while the rows below it
  // virtualize.
  const listHeader = (
    <>
      {/* One switcher instance, riding in the list header so it keeps the
          scroll view's content inset (hoisting it out put it behind the
          native large title) and stays the only live copy — two copies bound
          to one value is the bug Rankings had. */}
      {/* Search is Mesa's own field, not the navigation bar's native one: on iOS 26 the native bar
          folds into the bottom toolbar — behind the floating tab bar, so it was simply gone —
          and stacked under the title it takes the system's colours, unreadable at Night. */}
      <View className="mt-1">
        <Field
          ref={searchRef}
          icon={<SearchIcon size={18} color="text-muted" />}
          placeholder={t('explore.search_placeholder')}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <Segmented
        className="mt-3"
        value={view}
        onChange={setView}
        options={[
          { value: 'places', label: t('explore.view_places') },
          { value: 'events', label: t('explore.view_events') },
        ]}
      />

      {/* Both views stay mounted once visited, toggled by display — the old
          ternary unmounted Places' whole result list on every switch to
          Events and rebuilt it from scratch on the way back. Events rides in
          the header rather than in a scroller of its own, so there's exactly
          one scroll container on this screen. */}
      {eventsVisited ? (
        <View style={{ display: view === 'events' ? 'flex' : 'none' }}>
          <EventsBrowse />
        </View>
      ) : null}

      <View style={{ display: view === 'places' ? 'flex' : 'none' }}>
        {/* Sort, one "Filtros" pill that opens the combined panel
          (ExploreFilters), Abierto ahora, then one pill per ACTIVE
          filter with a small × in its corner to drop just that one,
          and "Limpiar todo" once anything is set. */}
        {/* The chips scroll; "Limpiar todo" is pinned OUTSIDE the scroll at
          the right edge. As the rail's last item it slid off-screen as
          soon as a filter pill was added — only "Lim" was left showing. */}
        <View className="-mx-5 mt-2 mb-2 flex-row items-center pt-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            className="flex-1"
            contentContainerClassName={`gap-2 pl-5 ${activeCount > 0 ? 'pr-3' : 'pr-5'}`}
          >
            <Chip size="sm" icon={<SortIcon size={12} />} chevron onPress={openSort}>
              {SORT_OPTIONS.find((o) => o.key === sort)?.label ?? t('explore.sort_chip')}
            </Chip>
            <Chip
              size="sm"
              icon={<SlidersIcon size={13} />}
              state={panelCount > 0 ? 'selected' : 'default'}
              onPress={() => setFiltersOpen(true)}
            >
              {panelCount > 0
                ? `${t('explore.filters_chip')} · ${panelCount}`
                : t('explore.filters_chip')}
            </Chip>
            {showOpenChip && (
              <Chip
                size="sm"
                state={openNow ? 'selected' : 'default'}
                onPress={() => setOpenNow((v) => !v)}
              >
                {t('explore.open_now')}
              </Chip>
            )}
            {hood ? (
              <RemovablePill
                label={neighborhoods.data?.neighborhoods.find((n) => n.slug === hood)?.name ?? hood}
                onRemove={() => setHood(null)}
              />
            ) : (
              <Chip size="sm" chevron onPress={pickHood}>
                {t('explore.sector')}
              </Chip>
            )}
            {cuisine ? (
              <RemovablePill
                label={cuisineLabel(cuisine) ?? cuisine}
                onRemove={() => setCuisine(null)}
              />
            ) : null}
            {price != null ? (
              <RemovablePill label={'$'.repeat(price)} onRemove={() => setPrice(null)} />
            ) : null}
            {occasion ? (
              <RemovablePill label={tagLabel(occasion)} onRemove={() => setOccasion(null)} />
            ) : null}
            {minScore != null ? (
              <RemovablePill label={`${minScore / 10}+`} onRemove={() => setMinScore(null)} />
            ) : null}
          </ScrollView>
          {activeCount > 0 && (
            <View className="border-line border-l pr-5 pl-2">
              <Pressable
                accessibilityRole="button"
                onPress={clearFilters}
                hitSlop={6}
                className="min-h-[36px] flex-row items-center gap-1 rounded-pill px-2 active:opacity-60"
              >
                <CloseIcon size={11} color="accent" strokeWidth={2.2} />
                <Caption numberOfLines={1} className="font-ui-semibold text-accent">
                  {t('explore.clear_all')}
                </Caption>
              </Pressable>
            </View>
          )}
        </View>

        <View className="mt-4">
          {/* Trending rides above the results, but only in the default browse
            state — once you've typed or filtered, the results ARE the answer
            and a heat rail is noise. */}
          {!browsing ? null : <TrendingRail />}

          {members.length > 0 && (
            <>
              <Eyebrow className="pb-2">{t('explore.members')}</Eyebrow>
              {members.map((m) => (
                <MemberRow key={m.id} m={m} />
              ))}
            </>
          )}

          {members.length > 0 && shownHits.length > 0 && (
            <Eyebrow className="pb-2 pt-3">{t('explore.spots')}</Eyebrow>
          )}
        </View>
      </View>
    </>
  )

  // ListEmptyComponent fires whenever `hits` is empty, which includes the
  // cases where members or Google suggestions DID come back — so the "no
  // match" copy keeps its original compound condition rather than claiming
  // nothing was found while rows sit right below it.
  const placesEmpty = results.isPending ? (
    <RowsSkeleton rows={3} thumb={48} />
  ) : results.isError ? (
    <ErrorState onRetry={() => results.refetch()}>{t('explore.search_error')}</ErrorState>
  ) : members.length === 0 && suggestions.length === 0 ? (
    <EmptyState
      action={
        activeCount > 0 ? (
          <Button size="sm" variant="secondary" onPress={clearFilters}>
            {t('explore.clear_filters')}
          </Button>
        ) : undefined
      }
    >
      {t('explore.no_match')}
    </EmptyState>
  ) : null

  return (
    <View className="flex-1 bg-bg">
      {/* The map entry is the navigation bar's right action; the search field is the page's own
          (in the list header) — see the comment there. */}
      <Stack.Screen options={headerOptions} />
      {/* Places is a real virtualized list (perf pass). It was a ScrollView
          with `hits.map()`, so the browse state mounted every row the
          catalog returned — ~97 of them, around a thousand native views.
          Pressing enter narrowed that to a handful, which meant React
          tearing down ~95 rows in ONE commit; on the New Architecture those
          mount instructions run on the main thread, the same thread that
          scrolls the list, so the screen stopped answering a swipe for a
          beat. Virtualizing means only a screenful is ever mounted. Events
          has no rows of its own — it rides in the header — so `data` empties
          out on that view rather than the list being swapped for another
          scroller. */}
      <FlatList
        ref={listRef}
        data={view === 'places' ? shownHits : NO_HITS}
        keyExtractor={keyExtractor}
        renderItem={renderHit}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={view === 'places' ? placesEmpty : null}
        ListFooterComponent={
          view === 'places' ? (
            <ExternalResults
              suggestions={suggestions}
              creatingId={creatingId}
              onPick={createFromGoogle}
              where={where}
              onWhere={setWhere}
              active={googleActive}
              nothingFound={nothingFound}
            />
          ) : null
        }
        windowSize={5}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        contentInsetAdjustmentBehavior="automatic"
        // Lets scrollToOffset go to the negative top offset (see useScrollTopOffset); by default RN clamps it to 0.
        scrollToOverflowEnabled
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        // The search field is the native header UISearchBar (see the header
        // note above), not a TextInput inside this list — but this still
        // works (M23): it reacts to the keyboard's own on-screen frame, not
        // to which view is first responder, so results at the bottom of a
        // long list are no longer hidden behind the keyboard.
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
      />
      <ExploreFilters
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={{ hood, cuisine, price, occasion, minScore }}
        onApply={(f) => {
          setHood(f.hood)
          setCuisine(f.cuisine)
          setPrice(f.price)
          setOccasion(f.occasion)
          setMinScore(f.minScore)
        }}
        neighborhoods={neighborhoods.data?.neighborhoods ?? []}
        cuisines={cuisines.data?.cuisines ?? []}
        countQuery={(d) => ({
          queryKey: exploreKey(debouncedQ, d, openNow, sort),
          queryFn: () => fetchExplore(debouncedQ, d, openNow, sort),
        })}
      />
    </View>
  )
}
