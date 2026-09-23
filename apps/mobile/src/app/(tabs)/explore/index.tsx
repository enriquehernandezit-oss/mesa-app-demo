import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import type { SearchBarCommands } from 'react-native-screens'

import { EventsBrowse } from '@/components/events/EventsBrowse'
import { type ExploreFilterValues, ExploreFilters } from '@/components/ExploreFilters'
import { ExternalResults } from '@/components/ExternalResults'
import { useTabBarClearance } from '@/components/MesaTabBar'
import {
  Button,
  Caption,
  Chip,
  EmptyState,
  ErrorState,
  RowsSkeleton,
  SectionHeader,
  Segmented,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { CloseIcon, PinIcon, SortIcon } from '@/components/ui/icons'
import { ScoreBadge, SpotCard, SpotRail } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { showSheet } from '@/components/ui/Sheet'
import { useResetOnTabPress } from '@/hooks/useResetOnTabPress'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { cuisineLabel, tagLabel } from '@/lib/display'
import { t as translate, useLanguage, useT } from '@/lib/i18n'
import type {
  ExploreHit,
  ExploreMember,
  ExploreResponse,
  Neighborhood,
  RailSpot,
} from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useExternalPlaceSearch } from '@/lib/useExternalPlaceSearch'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { DATA_FIGURES, themeColors } from '@/theme/vars'

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

// An applied filter, shown on its own in the rail with a small × badge on
// its top-right corner — tapping the pill drops just that filter.
function RemovablePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useT()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('explore.remove_filter')}: ${label}`}
      onPress={onRemove}
      hitSlop={4}
      className="active:scale-[0.97] active:opacity-80"
    >
      <View className="min-h-[36px] justify-center rounded-pill border border-accent bg-accent-fill px-3">
        <Text className="font-ui-medium text-micro text-on-accent">{label}</Text>
      </View>
      <View className="absolute -top-1.5 -right-1.5 h-[18px] w-[18px] items-center justify-center rounded-pill border border-bg bg-text">
        <CloseIcon size={10} color="bg" strokeWidth={2.4} />
      </View>
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
  const theme = useResolvedTheme()
  const c = themeColors[theme]
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
  // Imperative focus for the native search bar (Feed's search field hands
  // off here — see the Stack.Screen options below for why this can't be the
  // declarative `autoFocus` prop on iOS). `useFocusEffect`, not a plain
  // `useEffect`: Explore is a tab, so it can already be mounted from an
  // earlier visit this session — a plain effect keyed on `params.focus` only
  // fires on a genuine mount or a value change, neither of which is
  // guaranteed to happen again on a same-tab re-navigation, which is exactly
  // when this was silently doing nothing. `useFocusEffect` instead fires on
  // every tab-focus event and reads the current param fresh each time.
  // Delayed + retried, not a single immediate call: right when this screen
  // gains focus, react-native-screens' native header (and the UISearchBar
  // inside it) is often still mid-transition, and calling .focus() on a
  // UISearchBar that hasn't finished becoming the key view can silently do
  // nothing. `router.setParams` clears the flag once acted on, so revisiting
  // Explore later (via the tab bar, not Feed's search field) doesn't refocus
  // it again on a stale param.
  const searchBarRef = useRef<SearchBarCommands>(null)
  useFocusEffect(
    useCallback(() => {
      if (params.focus !== '1') return
      let cancelled = false
      let attempts = 0
      // Calls .focus() several times once the ref appears, not just once —
      // the ref going non-null only means the JS component mounted, not that
      // UIKit's UISearchBar has actually become ready to accept first-
      // responder status. A focus() call in that gap can silently no-op
      // with nothing to catch it by, which read as "the search bar does
      // nothing, it just navigates" — the params flag only clears once this
      // whole window has passed, so a late-arriving native view still gets
      // a real focus() call before this gives up.
      let focusCallsAfterRefAppeared = 0
      const tryFocus = () => {
        if (cancelled) return
        if (searchBarRef.current) {
          searchBarRef.current.focus()
          focusCallsAfterRefAppeared++
          if (focusCallsAfterRefAppeared >= 5) {
            router.setParams({ focus: '' })
            return
          }
          setTimeout(tryFocus, 120)
          return
        }
        attempts++
        if (attempts < 15) setTimeout(tryFocus, 80)
      }
      const kickoff = setTimeout(tryFocus, 100)
      return () => {
        cancelled = true
        clearTimeout(kickoff)
      }
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

  const [filtersOpen, setFiltersOpen] = useState(false)
  const panelCount = [hood, cuisine, price, occasion, minScore].filter((v) => v != null).length
  const activeCount = panelCount + (openNow ? 1 : 0)
  const clearFilters = () => {
    setHood(null)
    setCuisine(null)
    setPrice(null)
    setOpenNow(false)
    setOccasion(null)
    setMinScore(null)
  }

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
  const hits = results.data?.restaurants ?? []
  const members = results.data?.members ?? []
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

  // Google gap-filler — when Mesa's catalog comes up short (<3) for a real query,
  // offer online matches; tapping one creates a full profile and lands on it.
  const {
    suggestions,
    create: createFromGoogle,
    creatingId,
  } = useExternalPlaceSearch({
    query: q,
    mesaResultCount: hits.length + members.length,
    catalogNames: hits.map((h) => h.name),
    onCreated: (restaurant) => router.push(`/r/${restaurant.id}`),
  })

  // Memoized (responsiveness audit): written inline, this object got a brand
  // new `headerRight` function on every render — including every keystroke
  // via `onChangeText`/setQ and every query refetch — and react-native-
  // screens rebuilding the native header button mid-press could drop that
  // tap. Now it only changes when something it actually reads does.
  const headerOptions = useMemo(
    () => ({
      headerSearchBarOptions: {
        ref: searchBarRef,
        placeholder: translate(lang, 'explore.search_placeholder'),
        cancelButtonText: translate(lang, 'common.cancel'),
        hideWhenScrolling: false,
        autoCapitalize: 'none' as const,
        // Feed's own search field (FeedHeader in discover.tsx) is just a
        // Pressable that hands off here with `?focus=1` — the actual
        // focus is done imperatively below (searchBarRef.effect), not via
        // this `autoFocus` prop: react-native-screens 4.26's iOS native
        // module (RNSSearchBar.mm) never reads an autoFocus prop at all,
        // only exposes an imperative `focus` command — it's Android-only
        // there, so on iOS this was a silent no-op. Kept here anyway in
        // case Android ever ships; costs nothing.
        autoFocus: params.focus === '1',
        tintColor: c.accent,
        textColor: c.text,
        hintTextColor: c['text-muted'],
        headerIconColor: c['text-muted'],
        onChangeText: (e: { nativeEvent: { text: string } }) => setQ(e.nativeEvent.text),
      },
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={translate(lang, 'explore.map_label')}
          onPress={() => router.push('/map')}
          className="min-h-[44px] flex-row items-center gap-1.5 active:opacity-70"
        >
          <PinIcon size={15} />
          <Text className="font-ui-semibold text-eyebrow text-text-muted uppercase tracking-eyebrow">
            {translate(lang, 'explore.map_chip')}
          </Text>
        </Pressable>
      ),
    }),
    [lang, c, params.focus, router],
  )

  // Explore is nested one level inside its own Stack (explore/_layout.tsx),
  // so { nested: true } — see the hook's own header for why a plain
  // useNavigation() here would never see the tabPress event at all. One
  // scroll ref covers both Places and Events: they share this same
  // ScrollView, only toggled by display (see the comment below).
  const scrollRef = useRef<ScrollView>(null)
  useResetOnTabPress(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true })
      // A silent refetch, not onRefresh(): flipping RefreshControl's
      // `refreshing` on programmatically (not from an actual pull) shifts
      // the scroll offset down to reveal the spinner and doesn't reliably
      // restore it (usePullToRefresh's own header), which raced the
      // scrollTo above and left a tab re-press landing scrolled down
      // instead of at the top. A real pull-to-refresh gesture is untouched
      // — only this synthetic trigger skips the visible spinner.
      void results.refetch()
    }, [results]),
    { nested: true },
  )

  return (
    <View className="flex-1 bg-bg">
      {/* Search lives in the navigation bar, not the page: UIKit owns the field,
          its focus/cancel behavior, and the keyboard. The map entry is the bar's
          right action. */}
      <Stack.Screen options={headerOptions} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        // The search field is the native header UISearchBar (see the header
        // note above), not a TextInput inside this ScrollView — but this
        // still works (M23): it reacts to the keyboard's own on-screen frame,
        // not to which view is first responder, so results at the bottom of
        // a long list are no longer hidden behind the keyboard.
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
      >
        <Segmented
          className="mt-3"
          value={view}
          onChange={setView}
          options={[
            { value: 'places', label: t('explore.view_places') },
            { value: 'events', label: t('explore.view_events') },
          ]}
        />

        {/* Both views stay mounted once visited, toggled by display — the
            old ternary unmounted Places' whole result list on every switch
            to Events and rebuilt it from scratch on the way back, which is
            exactly the lag switching back to Places had. */}
        {eventsVisited ? (
          <View style={{ display: view === 'events' ? 'flex' : 'none' }}>
            <EventsBrowse />
          </View>
        ) : null}
        <View style={{ display: view === 'places' ? 'flex' : 'none' }}>
          <>
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
                  chevron
                  state={panelCount > 0 ? 'active' : 'default'}
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
                    label={
                      neighborhoods.data?.neighborhoods.find((n) => n.slug === hood)?.name ?? hood
                    }
                    onRemove={() => setHood(null)}
                  />
                ) : null}
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
                    <CloseIcon size={11} color="accent-strong" strokeWidth={2.2} />
                    <Caption numberOfLines={1} className="font-ui-semibold text-accent-strong">
                      {t('explore.clear_all')}
                    </Caption>
                  </Pressable>
                </View>
              )}
            </View>
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

            <View className="mt-4">
              {/* Trending rides above the results, but only in the default browse
              state — once you've typed or filtered, the results ARE the answer
              and a heat rail is noise. */}
              {!browsing ? null : <TrendingRail />}

              {members.length > 0 && (
                <>
                  <SectionHeader>{t('explore.members')}</SectionHeader>
                  {members.map((m) => (
                    <MemberRow key={m.id} m={m} />
                  ))}
                </>
              )}

              {results.isPending ? (
                <RowsSkeleton rows={3} thumb={48} />
              ) : results.isError ? (
                <ErrorState onRetry={() => results.refetch()}>
                  {t('explore.search_error')}
                </ErrorState>
              ) : hits.length === 0 && members.length === 0 && suggestions.length === 0 ? (
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
              ) : (
                <>
                  {members.length > 0 && hits.length > 0 && (
                    <SectionHeader>{t('explore.spots')}</SectionHeader>
                  )}
                  {hits.map((r, i) => (
                    <HitRow key={r.id} r={r} index={i} />
                  ))}
                </>
              )}

              <ExternalResults
                suggestions={suggestions}
                creatingId={creatingId}
                onPick={createFromGoogle}
              />
            </View>
          </>
        </View>
      </ScrollView>
    </View>
  )
}

// Wrapped in memo() (perf pass): Explore's results render via a plain
// `.map()`, not a virtualized list, so every mounted HitRow re-renders on
// every keystroke in the search bar otherwise — `setQ` (native search bar's
// onChangeText) updates this screen's state immediately, well before the
// debounced query itself refires, and with results already on screen that's
// real JS-thread work landing exactly while a finger is still on the glass.
//
// A white card on the cream ground, same row shape as Rankings' cards: one
// line of meta instead of Characteristics' two stacked lines.
const HitRow = memo(function HitRow({ r, index }: { r: ExploreHit; index: number }) {
  const t = useT()
  return (
    <Link href={`/r/${r.id}`} asChild>
      <Pressable className="mb-2 flex-row items-center gap-3 rounded-card border border-line bg-surface py-2.5 pr-3 pl-2 active:opacity-80">
        <Text
          style={[DATA_FIGURES, { width: 22 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          className="text-center font-ui-medium text-label text-text-muted"
        >
          {index + 1}
        </Text>
        <PlaceCover
          seed={r.id}
          name={r.name}
          coverImageId={r.coverImageId}
          size={{ w: 200, h: 200 }}
          className="h-12 w-12 rounded-sm"
        />
        <View className="flex-1">
          <Text className="font-ui-semibold text-subhead text-text" numberOfLines={1}>
            {r.name}
          </Text>
          <Caption numberOfLines={1} className="mt-[1px]">
            {[
              cuisineLabel(r.cuisine),
              // Imported rows often carry an address but no mapped sector —
              // fall back so the row still says where the place is.
              r.neighborhood ?? r.address,
              r.priceTier ? '$'.repeat(r.priceTier) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Caption>
        </View>
        {r.friendCount > 0 && r.friendAvg != null ? (
          <ScoreBadge
            size="sm"
            score={r.friendAvg}
            attribution={{ kind: 'friends', count: r.friendCount }}
          />
        ) : r.isNew ? (
          <Text className="font-ui-semibold text-eyebrow text-accent-strong uppercase tracking-eyebrow">
            {t('explore.be_first')}
          </Text>
        ) : null}
      </Pressable>
    </Link>
  )
})

// A member result row — links to their passport.
// What Santo Domingo is cheering this fortnight — a genuinely different signal
// from Explore's friend-score default, which is why it earns a rail here rather
// than a third rail on Discover (where the feed IS the product).
//
// The card carries ONLY the cheer count. Never a score, never a ScoreBadge: a
// bare number beside a place reads as the place's own rating, and in Mesa every
// score is attributed to a person. Cheers are activity, not a verdict.
function TrendingRail() {
  const t = useT()
  const q = useQuery({
    queryKey: ['trending'],
    queryFn: () => {
      track('trending_opened')
      return api.get<{ restaurants: RailSpot[] }>('/restaurants/trending')
    },
    staleTime: 300_000,
  })
  const spots = q.data?.restaurants ?? []
  // Under four qualifying spots the rail reads as broken rather than sparse —
  // a cold graph should show nothing at all.
  if (spots.length < 4) return null
  return (
    <SpotRail title={t('explore.trending_title')}>
      {spots.map((s) => (
        <SpotCard
          key={s.id}
          href={`/r/${s.id}`}
          seed={s.id}
          name={s.name}
          coverImageId={s.coverImageId}
          caption={
            <Caption className="text-micro" numberOfLines={1}>
              {t('explore.cheers_this_week', { n: s.cheerCount ?? 0 })}
            </Caption>
          }
        />
      ))}
    </SpotRail>
  )
}

// Wrapped in memo() (perf pass) — same reasoning as HitRow just above.
const MemberRow = memo(function MemberRow({ m }: { m: ExploreMember }) {
  const t = useT()
  return (
    <Link href={`/u/${m.id}`} asChild>
      <Pressable className="mb-2 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 active:opacity-80">
        <Avatar name={m.name || m.handle || 'm'} src={m.image} size={44} />
        <View className="flex-1">
          <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
            {m.name || m.handle}
          </Text>
          <Caption numberOfLines={1}>
            {[
              m.handle ? `@${m.handle}` : null,
              t('settings.ranked_count', { n: m.rankedCount }),
              m.neighborhood,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Caption>
        </View>
      </Pressable>
    </Link>
  )
})
