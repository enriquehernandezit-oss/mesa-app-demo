import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  type FocusEvent,
  Keyboard,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { EventsBrowse } from '@/components/events/EventsBrowse'
import { HitRow } from '@/components/explore/HitRow'
import { MemberRow } from '@/components/explore/MemberRow'
import { TrendingRail } from '@/components/explore/TrendingRail'
import {
  type ExploreFilterValues,
  ExploreFilters,
  NO_EXPLORE_FILTERS,
  exploreFilterCount,
} from '@/components/ExploreFilters'
import { ExternalResults } from '@/components/ExternalResults'
import { LocationFilter } from '@/components/LocationFilter'
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
import { toast } from '@/components/ui/toast-store'
import { useResetOnTabPress } from '@/hooks/useResetOnTabPress'
import { useScrollTopOffset } from '@/hooks/useScrollTopOffset'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { bringToTop, flatListHost } from '@/lib/bringToTop'
import { cuisineLabel, tagLabel } from '@/lib/display'
import type { LatLng } from '@/lib/haversine'
import { t as translate, useLanguage, useT } from '@/lib/i18n'
import {
  type LocationFilter as Location,
  isDefaultLocation,
  locationQuery,
  resetLocation,
  useLocationFilter,
} from '@/lib/locationFilter'
import type { ExploreHit, ExploreMember, ExploreResponse, Neighborhood } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useExternalPlaceSearch } from '@/lib/useExternalPlaceSearch'
import { currentLocationStatus, useMyLocation } from '@/lib/useMyLocation'
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
type SortKey = 'score' | 'name' | 'distance'

// Cerca and Abierto ahora: where the member is (only while Cerca is on) and whether to keep only places
// open this minute.
type Here = { near: LatLng | null; openNow: boolean }

// Stable identities: a fresh [] every render would churn FlatList's own
// diffing and defeat the memos keyed on these.
const NO_HITS: ExploreHit[] = []
const NO_MEMBERS: ExploreMember[] = []

// One key + fetch for the screen's results AND the filter panel's live
// count, so the panel's "Ver N lugares" warms exactly the cache entry the
// screen reads once those filters are applied.
// Sorted copies: picking Japanese then American is the same search (and cache entry) as the reverse.
const sorted = <T extends string | number>(xs: T[]) => [...xs].sort()
function exploreKey(q: string, f: ExploreFilterValues, sort: SortKey, loc: Location, here: Here) {
  return [
    'explore',
    q,
    sorted(f.hood),
    sorted(f.cuisine),
    sorted(f.price),
    sorted(f.occasion),
    sorted(f.highlight),
    f.minScore,
    sort,
    locationQuery(loc),
    nearParam(here.near),
    here.openNow,
  ]
}

// Rounded to 3 decimals (about 100 m) before it leaves the phone: "near" needs no more, and the API
// never stores it.
const nearParam = (p: LatLng | null) => (p ? `${p.lat.toFixed(3)},${p.lng.toFixed(3)}` : null)
function fetchExplore(q: string, f: ExploreFilterValues, sort: SortKey, loc: Location, here: Here) {
  const params = new URLSearchParams(locationQuery(loc))
  const near = nearParam(here.near)
  if (near) params.set('near', near)
  if (here.openNow) params.set('open', '1')
  if (q.length >= 2) params.set('q', q)
  // A facet with several picks repeats its param; the API matches any of them.
  for (const v of sorted(f.hood)) params.append('neighborhood', v)
  for (const v of sorted(f.cuisine)) params.append('cuisine', v)
  for (const v of sorted(f.price)) params.append('price', String(v))
  for (const v of sorted(f.occasion)) params.append('occasion', v)
  for (const v of sorted(f.highlight)) params.append('highlight', v)
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
  // Cerca and Abierto ahora. The position is asked for only when Cerca is tapped (iOS shows its
  // "while using the app" prompt the first time).
  const [nearby, setNearby] = useState(false)
  const [openNow, setOpenNow] = useState(false)
  const { position, request: requestLocation } = useMyLocation()
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'score', label: t('explore.sort_score') },
    ...(nearby ? [{ key: 'distance' as const, label: t('explore.sort_distance') }] : []),
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
  // Bumped when Explore starts over, so the location panel closes with it.
  const [locationReset, setLocationReset] = useState(0)
  if (view === 'events' && !eventsVisited) setEventsVisited(true)
  // Seeds the filter panel from a deep link — the restaurant profile's
  // neighborhood tap lands here with `?neighborhood=<slug>` already applied,
  // for instance. Read once on mount; the filter chips own the state after
  // that (a later navigation to /explore with new params re-mounts the
  // screen, so this isn't stale).
  const params = useLocalSearchParams<{
    neighborhood?: string
    cuisine?: string
    focus?: string
    view?: string
  }>()
  // One state for every filter in the panel. Seeded from a deep link once (see above).
  const [filters, setFilters] = useState<ExploreFilterValues>(() => ({
    ...NO_EXPLORE_FILTERS,
    hood: params.neighborhood ? [params.neighborhood] : [],
    cuisine: params.cuisine ? [params.cuisine] : [],
  }))
  // Drops one pick from a facet (the × on its pill in the rail).
  const removePick = <K extends 'hood' | 'cuisine' | 'occasion' | 'highlight'>(k: K, v: string) =>
    setFilters((f) => ({ ...f, [k]: f[k].filter((x) => x !== v) }))
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
  // The Feed's Events view ends in "See all in Explore": `?view=events` lands on the Events side.
  // Cleared once acted on, so the tab bar later brings you back to whichever side you left.
  useFocusEffect(
    useCallback(() => {
      if (params.view !== 'events') return
      setView('events')
      router.setParams({ view: '' })
    }, [params.view, router]),
  )
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

  // Cerca: on asks for the position (and sorts nearest first); off forgets it for this screen. A
  // refusal says where to turn it back on, rather than a chip that silently does nothing.
  const toggleNearby = async () => {
    if (nearby) {
      setNearby(false)
      setSort((s) => (s === 'distance' ? 'score' : s))
      return
    }
    const pos = await requestLocation()
    if (!pos) {
      if (currentLocationStatus() === 'denied') {
        Alert.alert(t('explore.location_off_title'), t('explore.location_off_body'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('explore.open_settings'), onPress: () => Linking.openSettings() },
        ])
      } else {
        toast({ variant: 'error', message: t('map.location_error') })
      }
      return
    }
    setNearby(true)
    setSort('distance')
  }

  // "Neighborhood ▾": the one filter worth a pill of its own — a bottom-sheet chooser, the same
  // pattern as Your list's. (The rest live in the Filters panel.)
  // With no sector picked, the rail's "Sector ▾" picks one here; more are added in the panel.
  const pickHood = async () => {
    const list = neighborhoods.data?.neighborhoods ?? []
    const v = await pickOne(
      t('explore.sector'),
      list.map((n) => n.slug),
      null,
      (slug) => list.find((n) => n.slug === slug)?.name ?? slug,
    )
    if (v) setFilters((f) => ({ ...f, hood: [v] }))
  }

  const [filtersOpen, setFiltersOpen] = useState(false)
  const panelCount = exploreFilterCount(filters)
  const activeCount = panelCount + (nearby ? 1 : 0) + (openNow ? 1 : 0)
  const clearFilters = useCallback(() => {
    setNearby(false)
    setOpenNow(false)
    setSort((s) => (s === 'distance' ? 'score' : s))
    setFilters(NO_EXPLORE_FILTERS)
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
  const filterValues = filters
  // WHERE to look — Santo Domingo by default — scopes Mesa's own places here and Google's below.
  const location = useLocationFilter()
  const here: Here = { near: nearby ? position : null, openNow }
  const results = useQuery({
    queryKey: exploreKey(debouncedQ, filterValues, sort, location, here),
    queryFn: () => fetchExplore(debouncedQ, filterValues, sort, location, here),
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
    debouncedQ.length < 2 && panelCount === 0 && !nearby && !openNow && isDefaultLocation(location)

  // Google — any restaurant, Santo Domingo first then the Dominican Republic then the world
  // (the location filter narrows or widens that), for every real query, not just the ones
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
  // Searching: the field is focused, or holds a search. The navigation bar (the big "Explora" and the
  // map button) steps away so the field sits at the top and the results fill the space above the
  // keyboard — iOS folds a large title only under a finger, never for a scroll made in code, so the
  // bar has to go. It comes back once the field is empty and the keyboard is down.
  const [searchFocused, setSearchFocused] = useState(false)
  const searching = searchFocused || q.trim().length > 0
  const headerOptions = useMemo(
    () => ({
      headerShown: !searching,
      headerRight: () => (
        <IconButton
          accessibilityLabel={translate(lang, 'explore.map_label')}
          onPress={() => router.push('/map')}
          icon={<MapIcon size={18} color="text" />}
        />
      ),
    }),
    [lang, router, searching],
  )

  // Explore is nested one level inside its own Stack (explore/_layout.tsx),
  // so { nested: true } — see the hook's own header for why a plain
  // useNavigation() here would never see the tabPress event at all. One ref
  // still covers both views: they share this list, Events riding in its
  // header and Places as the rows (see the render below).
  const listRef = useRef<FlatList<ExploreHit>>(null)
  // Not offset 0 — the list rests a large-title header lower than that (useScrollTopOffset).
  const topOffset = useScrollTopOffset()
  // Tapping the search (or the city search under it) slides it up to just under the large title, so the
  // results fill the space above the keyboard (lib/bringToTop.ts). Under the title, not under a folded
  // bar: iOS folds a large title only under a finger, so a field slid higher hid behind "Explora".
  const liftSearch = (e: FocusEvent, gap: number) =>
    bringToTop(flatListHost(listRef), e, { top: -topOffset, gap })
  const insets = useSafeAreaInsets()
  useResetOnTabPress(
    useCallback(
      (wasActive: boolean) => {
        // Pressing Explore while you are ALREADY on it starts over: no search, no filters, the
        // default sort, the Places view, Santo Domingo again, the keyboard away. (Coming
        // from another tab keeps your search — only the scroll position is refreshed.)
        if (wasActive) {
          Keyboard.dismiss()
          setQ('')
          clearFilters()
          setSort('score')
          setView('places')
          resetLocation()
          setLocationReset((n) => n + 1)
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
      [results, topOffset, clearFilters],
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
          onFocus={(e) => {
            setSearchFocused(true)
            // The bar is leaving, so the field goes to just under the status bar.
            bringToTop(flatListHost(listRef), e, { top: insets.top, gap: 8 })
          }}
          onBlur={() => setSearchFocused(false)}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {/* Where to look. Places only: Events has no place to scope. */}
      {view === 'places' ? (
        <View className="mt-2">
          <LocationFilter resetKey={locationReset} onSearchFocus={(e) => liftSearch(e, 12)} />
        </View>
      ) : null}
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
          <EventsBrowse gutter={16} />
        </View>
      ) : null}

      <View style={{ display: view === 'places' ? 'flex' : 'none' }}>
        {/* Sort, one "Filtros" pill that opens the combined panel
          (ExploreFilters), then one pill per ACTIVE
          filter with a small × in its corner to drop just that one,
          and "Limpiar todo" once anything is set. */}
        {/* The chips scroll; "Limpiar todo" is pinned OUTSIDE the scroll at
          the right edge. As the rail's last item it slid off-screen as
          soon as a filter pill was added — only "Lim" was left showing. */}
        <View className="-mx-4 mt-2 mb-2 flex-row items-center pt-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            className="flex-1"
            contentContainerClassName={`gap-2 pl-4 ${activeCount > 0 ? 'pr-3' : 'pr-4'}`}
          >
            <Chip size="sm" icon={<SortIcon size={12} />} chevron onPress={openSort}>
              {SORT_OPTIONS.find((o) => o.key === sort)?.label ?? t('explore.sort_chip')}
            </Chip>
            <Chip size="sm" state={nearby ? 'selected' : 'default'} onPress={toggleNearby}>
              {t('explore.nearby')}
            </Chip>
            <Chip
              size="sm"
              state={openNow ? 'selected' : 'default'}
              onPress={() => setOpenNow((v) => !v)}
            >
              {t('explore.open_now')}
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
            {/* One pill per pick, each with its own ×. */}
            {filters.hood.length === 0 ? (
              <Chip size="sm" chevron onPress={pickHood}>
                {t('explore.sector')}
              </Chip>
            ) : (
              filters.hood.map((slug) => (
                <RemovablePill
                  key={`hood-${slug}`}
                  label={
                    neighborhoods.data?.neighborhoods.find((n) => n.slug === slug)?.name ?? slug
                  }
                  onRemove={() => removePick('hood', slug)}
                />
              ))
            )}
            {filters.cuisine.map((c) => (
              <RemovablePill
                key={`cuisine-${c}`}
                label={cuisineLabel(c) ?? c}
                onRemove={() => removePick('cuisine', c)}
              />
            ))}
            {filters.price.map((n) => (
              <RemovablePill
                key={`price-${n}`}
                label={'$'.repeat(n)}
                onRemove={() =>
                  setFilters((f) => ({ ...f, price: f.price.filter((x) => x !== n) }))
                }
              />
            ))}
            {filters.occasion.map((tag) => (
              <RemovablePill
                key={`occasion-${tag}`}
                label={tagLabel(tag)}
                onRemove={() => removePick('occasion', tag)}
              />
            ))}
            {filters.highlight.map((tag) => (
              <RemovablePill
                key={`highlight-${tag}`}
                label={tagLabel(tag)}
                onRemove={() => removePick('highlight', tag)}
              />
            ))}
            {filters.minScore != null ? (
              <RemovablePill
                label={`${filters.minScore / 10}+`}
                onRemove={() => setFilters((f) => ({ ...f, minScore: null }))}
              />
            ) : null}
          </ScrollView>
          {activeCount > 0 && (
            <View className="border-line border-l pr-4 pl-2">
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
              active={googleActive}
              nothingFound={nothingFound}
            />
          ) : null
        }
        windowSize={5}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        showsVerticalScrollIndicator={false}
        // 16pt, not the usual 24: the native large title ("Explora") sits ~16pt in and cannot be moved, so the
        // search field, filters and cards line up with it.
        contentContainerClassName="px-4"
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        contentInsetAdjustmentBehavior="automatic"
        // Lets scrollToOffset go to the negative top offset (see useScrollTopOffset); by default RN clamps it to 0.
        scrollToOverflowEnabled
        // Dragging the results hides the keyboard at once (Instagram, WhatsApp) — they are what you
        // are reading — and automaticallyAdjustKeyboardInsets (below) leaves room to scroll to the last one.
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        // The search field is a Field in this list's header. This reacts to the keyboard's
        // on-screen frame, so results at the bottom of a long list aren't hidden behind it.
        // No field in the app has an input accessory view (see Field.tsx): with one, React
        // Native also shifts the offset of every list that sets this prop, mounted or not.
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
      />
      <ExploreFilters
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onApply={setFilters}
        neighborhoods={neighborhoods.data?.neighborhoods ?? []}
        cuisines={cuisines.data?.cuisines ?? []}
        countQuery={(d) => ({
          queryKey: exploreKey(debouncedQ, d, sort, location, here),
          queryFn: () => fetchExplore(debouncedQ, d, sort, location, here),
        })}
      />
    </View>
  )
}
