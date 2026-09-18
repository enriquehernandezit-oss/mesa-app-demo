import { ExternalResults } from '@/components/ExternalResults'
import { useTabBarClearance } from '@/components/MesaTabBar'
import { EventsBrowse } from '@/components/events/EventsBrowse'
import {
  Body,
  Button,
  Caption,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  RowsSkeleton,
  SectionHeader,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { pickOne, showSheet } from '@/components/ui/Sheet'
import { PinIcon, SortIcon } from '@/components/ui/icons'
import { Characteristics, ScoreBadge, SpotCard, SpotRail } from '@/components/ui/patterns'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { OCCASION_TAGS, cuisineLabel, tagLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
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
import { useQuery } from '@tanstack/react-query'
import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import type { SearchBarCommands } from 'react-native-screens'

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
const PRICES = [1, 2, 3, 4]
// Score bands (A1, expanded M14) — a small cacheable set instead of a free
// slider, cut against the real catalog distribution (p75 ≈ 8.8): "9.5+" is a
// deliberately tiny elite set, "8+" roughly the top quartile. Stored scale
// (0–100), same units as rankings.score; the API already takes any number.
const SCORE_BANDS: { value: number; label: string }[] = [
  { value: 70, label: '7+' },
  { value: 75, label: '7.5+' },
  { value: 80, label: '8+' },
  { value: 85, label: '8.5+' },
  { value: 90, label: '9+' },
  { value: 95, label: '9.5+' },
]
type SortKey = 'score' | 'name'

export default function ExploreScreen() {
  const t = useT()
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
  // Lugares/Eventos (M21) — a plain view-switcher, same shape as Rankings'
  // Mine/Saved/Sectores chips (a control living inside a scrolling page is
  // content, not chrome, per CLAUDE.md — that's why this is Chips, not a
  // segmented control). Eventos swaps out everything below it: the filter
  // pills, the trending rail and the Google gap-filler are all Lugares-only
  // concepts with no events equivalent.
  const [view, setView] = useState<'lugares' | 'eventos'>('lugares')
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

  // Replaces the old single "Filtros (N)" trigger + inline FilterGroup panel
  // — one dedicated pill per dimension, each showing its own set value
  // directly ("Piantini ▾"), reads faster than one generic trigger hiding
  // five mixed dimensions. pickOne (components/ui/Sheet.tsx) is shared with
  // Rankings' identical pill pattern.
  async function pickSector() {
    const values = neighborhoods.data?.neighborhoods.map((n) => n.slug) ?? []
    const v = await pickOne(t('explore.sector'), values, hood, (slug) => {
      return neighborhoods.data?.neighborhoods.find((n) => n.slug === slug)?.name ?? slug
    })
    if (v !== undefined) setHood(v)
  }
  async function pickCuisine() {
    const values = cuisines.data?.cuisines ?? []
    const v = await pickOne(t('explore.cuisine'), values, cuisine, (c) => cuisineLabel(c) ?? c)
    if (v !== undefined) setCuisine(v)
  }
  async function pickPrice() {
    const v = await pickOne(t('explore.price'), PRICES, price, (p) => '$'.repeat(p))
    if (v !== undefined) setPrice(v)
  }
  async function pickOccasion() {
    const v = await pickOne(t('explore.occasion'), OCCASION_TAGS, occasion, (tag) => tagLabel(tag))
    if (v !== undefined) setOccasion(v)
  }
  async function pickMinScore() {
    const values = SCORE_BANDS.map((b) => b.value)
    const v = await pickOne(t('explore.sort_score'), values, minScore, (val) => {
      return SCORE_BANDS.find((b) => b.value === val)?.label ?? String(val)
    })
    if (v !== undefined) setMinScore(v)
  }

  const activeCount =
    [hood, cuisine, price, occasion, minScore].filter((v) => v != null).length + (openNow ? 1 : 0)
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
  const results = useQuery({
    queryKey: ['explore', debouncedQ, hood, cuisine, price, openNow, occasion, minScore, sort],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedQ.length >= 2) params.set('q', debouncedQ)
      if (hood) params.set('neighborhood', hood)
      if (cuisine) params.set('cuisine', cuisine)
      if (price) params.set('price', String(price))
      if (openNow) params.set('open', '1')
      if (occasion) params.set('occasion', occasion)
      if (minScore) params.set('minScore', String(minScore))
      params.set('sort', sort)
      return api.get<ExploreResponse>(`/restaurants?${params}`)
    },
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

  return (
    <View className="flex-1 bg-bg">
      {/* Search lives in the navigation bar, not the page: UIKit owns the field,
          its focus/cancel behavior, and the keyboard. The map entry is the bar's
          right action. */}
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            ref: searchBarRef,
            placeholder: t('explore.search_placeholder'),
            cancelButtonText: t('common.cancel'),
            hideWhenScrolling: false,
            autoCapitalize: 'none',
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
            onChangeText: (e) => setQ(e.nativeEvent.text),
          },
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('explore.map_label')}
              onPress={() => router.push('/map')}
              className="min-h-[44px] flex-row items-center gap-1.5 active:opacity-70"
            >
              <PinIcon size={15} />
              <Text className="font-ui-semibold text-eyebrow text-text-muted uppercase tracking-eyebrow">
                {t('explore.map_chip')}
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
      >
        <View className="mt-3 flex-row gap-2">
          <Chip
            state={view === 'lugares' ? 'selected' : 'default'}
            onPress={() => setView('lugares')}
          >
            {t('explore.view_places')}
          </Chip>
          <Chip
            state={view === 'eventos' ? 'selected' : 'default'}
            onPress={() => setView('eventos')}
          >
            {t('explore.view_events')}
          </Chip>
        </View>

        {view === 'eventos' ? (
          <EventsBrowse />
        ) : (
          <>
            {/* One dedicated dropdown pill per dimension (M14), replacing the
                old single "Filtros (N)" trigger + inline FilterGroup panel —
                a set filter shows its OWN value right on the pill
                ("Piantini ▾"), so reading what's active doesn't need opening
                anything. */}
            <ChipRail className="mt-3 mb-2">
              <Chip size="sm" icon={<SortIcon size={12} />} chevron onPress={openSort}>
                {SORT_OPTIONS.find((o) => o.key === sort)?.label ?? t('explore.sort_chip')}
              </Chip>
              <Chip size="sm" chevron state={hood ? 'selected' : 'default'} onPress={pickSector}>
                {hood
                  ? (neighborhoods.data?.neighborhoods.find((n) => n.slug === hood)?.name ?? hood)
                  : t('explore.sector')}
              </Chip>
              <Chip
                size="sm"
                chevron
                state={cuisine ? 'selected' : 'default'}
                onPress={pickCuisine}
              >
                {cuisine ? (cuisineLabel(cuisine) ?? cuisine) : t('explore.cuisine')}
              </Chip>
              <Chip
                size="sm"
                chevron
                state={price != null ? 'selected' : 'default'}
                onPress={pickPrice}
              >
                {price != null ? '$'.repeat(price) : t('explore.price')}
              </Chip>
              <Chip
                size="sm"
                chevron
                state={occasion ? 'selected' : 'default'}
                onPress={pickOccasion}
              >
                {occasion ? tagLabel(occasion) : t('explore.occasion')}
              </Chip>
              <Chip
                size="sm"
                chevron
                state={minScore != null ? 'selected' : 'default'}
                onPress={pickMinScore}
              >
                {minScore != null
                  ? (SCORE_BANDS.find((b) => b.value === minScore)?.label ?? minScore)
                  : t('explore.sort_score')}
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
              {activeCount > 0 && (
                <Pressable
                  accessibilityRole="button"
                  onPress={clearFilters}
                  className="min-h-[36px] justify-center px-1 active:opacity-60"
                >
                  <Caption className="font-ui-semibold text-accent-strong">
                    {t('explore.clear')}
                  </Caption>
                </Pressable>
              )}
            </ChipRail>

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
        )}
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
const HitRow = memo(function HitRow({ r, index }: { r: ExploreHit; index: number }) {
  const t = useT()
  return (
    <Link href={`/r/${r.id}`} asChild>
      <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
        <Text style={DATA_FIGURES} className="w-5 font-ui-medium text-eyebrow text-text-muted">
          {index + 1}
        </Text>
        <PlaceCover
          seed={r.id}
          name={r.name}
          coverImageId={r.coverImageId}
          size={{ w: 200, h: 200 }}
          className="h-12 w-12"
        />
        <View className="flex-1">
          <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
            {r.name}
          </Text>
          <Characteristics
            priceTier={r.priceTier}
            cuisine={r.cuisine}
            // Imported rows often carry an address but no mapped sector — fall
            // back so the row still says where the place is.
            neighborhood={r.neighborhood ?? r.address ?? null}
          />
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
      <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
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
