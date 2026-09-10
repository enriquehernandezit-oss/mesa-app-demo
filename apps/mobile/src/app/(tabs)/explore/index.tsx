import { ExternalResults } from '@/components/ExternalResults'
import { RANK_FAB_CLEARANCE } from '@/components/RankFab'
import {
  Body,
  Caption,
  Chip,
  EmptyState,
  ErrorState,
  RowsSkeleton,
  SectionHeader,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { showSheet } from '@/components/ui/Sheet'
import { PinIcon, SortIcon } from '@/components/ui/icons'
import {
  Characteristics,
  FilterGroup,
  ScoreBadge,
  SpotCard,
  SpotRail,
} from '@/components/ui/patterns'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { OCCASION_TAGS, cuisineLabel } from '@/lib/display'
import type {
  ExploreHit,
  ExploreMember,
  ExploreResponse,
  Neighborhood,
  RailSpot,
} from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useExternalPlaceSearch } from '@/lib/useExternalPlaceSearch'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'
import { useQuery } from '@tanstack/react-query'
import { Link, Stack, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// Explore (Phase 6 mock F1) — searches your circle's rankings, not the open
// internet. Browses top spots by default; a query also returns members and
// dish-matched places. Ported from apps/app/src/screens/explore/
// ExploreScreen.tsx. The QuickActions rail is dropped (same as the feed —
// inert / map-gated).
//
// Filters (D3): used to be three stacked, unlabelled ChipRails — 13+ chips at
// identical visual weight, mixing sort/open-now/price/sector/cuisine with no
// group headers, which is what read as a "dead band" running the width of the
// screen. Now the same trigger + inline-panel + removable-chips idiom
// Rankings already has (rankings.tsx's mineControls) — one place for this
// pattern instead of two different ones.
const PRICES = [1, 2, 3, 4]
// Score bands (A1) — a small cacheable set instead of a free slider, cut
// against the real catalog distribution (p75 ≈ 8.8): "9+" is a deliberately
// small elite set, "8+" roughly the top quartile. Stored scale (0–100), same
// units as rankings.score.
const SCORE_BANDS: { value: number; label: string }[] = [
  { value: 80, label: '8+' },
  { value: 90, label: '9+' },
]
type SortKey = 'score' | 'name'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Puntuación' },
  { key: 'name', label: 'Nombre' },
]

export default function ExploreScreen() {
  const router = useRouter()
  const theme = useResolvedTheme()
  const c = themeColors[theme]
  const [q, setQ] = useState('')
  const [hood, setHood] = useState<string | null>(null)
  const [cuisine, setCuisine] = useState<string | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [openNow, setOpenNow] = useState(false)
  const [occasion, setOccasion] = useState<string | null>(null)
  const [minScore, setMinScore] = useState<number | null>(null)
  const [sort, setSort] = useState<SortKey>('score')
  const [filterOpen, setFilterOpen] = useState(false)

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
      title: 'Ordenar por',
      options: SORT_OPTIONS.map((o) => ({ label: o.label })),
      selectedIndex: SORT_OPTIONS.findIndex((o) => o.key === sort),
    })
    if (idx != null) setSort(SORT_OPTIONS[idx].key)
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
            placeholder: 'Busca un spot, plato o miembro',
            cancelButtonText: 'Cancelar',
            hideWhenScrolling: false,
            autoCapitalize: 'none',
            tintColor: c.accent,
            textColor: c.text,
            hintTextColor: c['text-muted'],
            headerIconColor: c['text-muted'],
            onChangeText: (e) => setQ(e.nativeEvent.text),
          },
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver el mapa"
              onPress={() => router.push('/map')}
              className="min-h-[44px] flex-row items-center gap-1.5 active:opacity-70"
            >
              <PinIcon size={15} />
              <Text className="font-mono text-eyebrow text-text-muted uppercase tracking-eyebrow">
                Mapa
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: RANK_FAB_CLEARANCE }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {/* Sort + filter trigger row, and — while open — the grouped panel
            below it. Mirrors Rankings' mineControls: one "Filtros" trigger
            opens one panel, instead of three stacked rails mixing five
            dimensions (sort, open-now, price, sector, cuisine) at identical
            visual weight with no group headers. */}
        <View className="mt-3 mb-2 gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Chip size="sm" icon={<SortIcon size={12} />} chevron onPress={openSort}>
              {SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Ordenar'}
            </Chip>
            <Chip
              size="sm"
              state={filterOpen ? 'active' : activeCount > 0 ? 'selected' : 'default'}
              chevron
              onPress={() => setFilterOpen((v) => !v)}
            >
              {activeCount > 0 ? `Filtros (${activeCount})` : 'Filtros'}
            </Chip>
            {hood && (
              <Chip size="sm" state="selected" onPress={() => setHood(null)}>
                {neighborhoods.data?.neighborhoods.find((n) => n.slug === hood)?.name ?? hood} ✕
              </Chip>
            )}
            {cuisine && (
              <Chip size="sm" state="selected" onPress={() => setCuisine(null)}>
                {cuisineLabel(cuisine) ?? cuisine} ✕
              </Chip>
            )}
            {price != null && (
              <Chip size="sm" state="selected" onPress={() => setPrice(null)}>
                {'$'.repeat(price)} ✕
              </Chip>
            )}
            {openNow && (
              <Chip size="sm" state="selected" onPress={() => setOpenNow(false)}>
                Abierto ahora ✕
              </Chip>
            )}
            {occasion && (
              <Chip size="sm" state="selected" onPress={() => setOccasion(null)}>
                {occasion} ✕
              </Chip>
            )}
            {minScore != null && (
              <Chip size="sm" state="selected" onPress={() => setMinScore(null)}>
                {SCORE_BANDS.find((b) => b.value === minScore)?.label ?? minScore} ✕
              </Chip>
            )}
            {activeCount > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={clearFilters}
                className="min-h-[36px] justify-center px-1 active:opacity-60"
              >
                <Caption className="font-mono text-accent-strong">Limpiar</Caption>
              </Pressable>
            )}
          </View>

          {filterOpen && (
            <View className="gap-3 rounded border border-line bg-surface p-3">
              {showOpenChip && (
                <Chip
                  size="sm"
                  state={openNow ? 'selected' : 'default'}
                  onPress={() => setOpenNow((v) => !v)}
                >
                  Abierto ahora
                </Chip>
              )}
              <FilterGroup
                label="Sector"
                values={neighborhoods.data?.neighborhoods.map((n) => n.slug) ?? []}
                selected={hood}
                render={(v) =>
                  neighborhoods.data?.neighborhoods.find((n) => n.slug === v)?.name ?? String(v)
                }
                onToggle={(v) => setHood(hood === v ? null : String(v))}
              />
              <FilterGroup
                label="Cocina"
                values={cuisines.data?.cuisines ?? []}
                selected={cuisine}
                render={(v) => cuisineLabel(String(v)) ?? String(v)}
                onToggle={(v) => setCuisine(cuisine === v ? null : String(v))}
              />
              <FilterGroup
                label="Precio"
                values={PRICES}
                selected={price}
                render={(v) => '$'.repeat(Number(v))}
                onToggle={(v) => setPrice(price === v ? null : Number(v))}
              />
              <FilterGroup
                label="Ocasión"
                values={OCCASION_TAGS}
                selected={occasion}
                render={(v) => String(v)}
                onToggle={(v) => setOccasion(occasion === v ? null : String(v))}
              />
              <FilterGroup
                label="Puntuación"
                values={SCORE_BANDS.map((b) => b.value)}
                selected={minScore}
                render={(v) => SCORE_BANDS.find((b) => b.value === v)?.label ?? String(v)}
                onToggle={(v) => setMinScore(minScore === v ? null : Number(v))}
              />
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
              <SectionHeader>Miembros</SectionHeader>
              {members.map((m) => (
                <MemberRow key={m.id} m={m} />
              ))}
            </>
          )}

          {results.isPending ? (
            <RowsSkeleton rows={3} thumb={48} />
          ) : results.isError ? (
            <ErrorState onRetry={() => results.refetch()}>No se pudo buscar.</ErrorState>
          ) : hits.length === 0 && members.length === 0 && suggestions.length === 0 ? (
            <EmptyState>Nada coincide.</EmptyState>
          ) : (
            <>
              {members.length > 0 && hits.length > 0 && <SectionHeader>Spots</SectionHeader>}
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
      </ScrollView>
    </View>
  )
}

function HitRow({ r, index }: { r: ExploreHit; index: number }) {
  return (
    <Link href={`/r/${r.id}`} asChild>
      <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
        <Text className="w-5 font-mono text-eyebrow text-text-muted">{index + 1}</Text>
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
          <Text className="font-mono text-micro text-accent-strong uppercase tracking-eyebrow">
            Sé el primero
          </Text>
        ) : null}
      </Pressable>
    </Link>
  )
}

// A member result row — links to their passport.
// What Santo Domingo is cheering this fortnight — a genuinely different signal
// from Explore's friend-score default, which is why it earns a rail here rather
// than a third rail on Discover (where the feed IS the product).
//
// The card carries ONLY the cheer count. Never a score, never a ScoreBadge: a
// bare number beside a place reads as the place's own rating, and in Mesa every
// score is attributed to a person. Cheers are activity, not a verdict.
function TrendingRail() {
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
    <SpotRail title="Sonando esta semana">
      {spots.map((s) => (
        <SpotCard
          key={s.id}
          href={`/r/${s.id}`}
          seed={s.id}
          name={s.name}
          coverImageId={s.coverImageId}
          caption={
            <Caption className="font-mono text-micro" numberOfLines={1}>
              {s.cheerCount} {s.cheerCount === 1 ? 'cheer' : 'cheers'} esta semana
            </Caption>
          }
        />
      ))}
    </SpotRail>
  )
}

function MemberRow({ m }: { m: ExploreMember }) {
  return (
    <Link href={`/u/${m.id}`} asChild>
      <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
        <Avatar name={m.name || m.handle || 'm'} src={m.image} size={44} />
        <View className="flex-1">
          <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
            {m.name || m.handle}
          </Text>
          <Caption numberOfLines={1}>
            {[m.handle ? `@${m.handle}` : null, `${m.rankedCount} rankeados`, m.neighborhood]
              .filter(Boolean)
              .join(' · ')}
          </Caption>
        </View>
      </Pressable>
    </Link>
  )
}
