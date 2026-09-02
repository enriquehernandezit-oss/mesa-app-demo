import { ExternalResults } from '@/components/ExternalResults'
import { RANK_FAB_CLEARANCE } from '@/components/RankFab'
import { TopBar } from '@/components/TopBar'
import {
  Body,
  Caption,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  Eyebrow,
  SectionHeader,
  Title,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { PinIcon, SortIcon } from '@/components/ui/icons'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { api } from '@/lib/api'
import { cuisineLabel } from '@/lib/display'
import type { ExploreHit, ExploreMember, ExploreResponse, Neighborhood } from '@/lib/types'
import { useExternalPlaceSearch } from '@/lib/useExternalPlaceSearch'
import { useColor } from '@/theme/useColor'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'

// Explore (Phase 6 mock F1) — searches your circle's rankings, not the open
// internet. Browses top spots by default; a query also returns members and
// dish-matched places. Filter rails: attributes (score / open now / price),
// sector, cuisine. Ported from apps/app/src/screens/explore/ExploreScreen.tsx.
// The QuickActions rail is dropped (same as the feed — inert / map-gated).
const PRICES = [1, 2, 3, 4]

export default function ExploreScreen() {
  const router = useRouter()
  const placeholder = useColor('text-muted')
  const [q, setQ] = useState('')
  const [hood, setHood] = useState<string | null>(null)
  const [cuisine, setCuisine] = useState<string | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [openNow, setOpenNow] = useState(false)
  const [sort, setSort] = useState<'name' | 'score'>('score')

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

  // Default browse: with no query and no filters the API returns the top spots
  // by friends' score, so Explore is never a blank screen.
  const results = useQuery({
    queryKey: ['explore', q.trim(), hood, cuisine, price, openNow, sort],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q.trim().length >= 2) params.set('q', q.trim())
      if (hood) params.set('neighborhood', hood)
      if (cuisine) params.set('cuisine', cuisine)
      if (price) params.set('price', String(price))
      if (openNow) params.set('open', '1')
      params.set('sort', sort)
      return api.get<ExploreResponse>(`/restaurants?${params}`)
    },
  })

  const hits = results.data?.restaurants ?? []
  const members = results.data?.members ?? []

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
      <TopBar variant="discover" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: RANK_FAB_CLEARANCE }}
      >
        <View className="flex-row items-start justify-between">
          <View>
            <Eyebrow>Explorar</Eyebrow>
            <Title className="mb-3">Encuentra un spot</Title>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver el mapa"
            onPress={() => router.push('/map')}
            className="min-h-[44px] flex-row items-center gap-1.5 active:opacity-70"
          >
            <PinIcon size={15} />
            <Text className="font-mono text-[11px] text-text-muted uppercase tracking-eyebrow">
              Mapa
            </Text>
          </Pressable>
        </View>
        <TextInput
          className="min-h-[48px] rounded border border-line bg-surface px-4 font-ui text-body text-text"
          placeholderTextColor={placeholder}
          placeholder="Busca un spot, plato o miembro"
          value={q}
          onChangeText={setQ}
        />

        {/* Attribute filters (sort / open / price). */}
        <ChipRail className="mt-3">
          <Chip
            size="sm"
            icon={<SortIcon size={12} />}
            state={sort === 'score' ? 'selected' : 'default'}
            onPress={() => setSort(sort === 'score' ? 'name' : 'score')}
          >
            Puntuación
          </Chip>
          {showOpenChip && (
            <Chip
              size="sm"
              state={openNow ? 'selected' : 'default'}
              onPress={() => setOpenNow((v) => !v)}
            >
              Abierto ahora
            </Chip>
          )}
          {PRICES.map((pt) => (
            <Chip
              key={pt}
              size="sm"
              state={price === pt ? 'selected' : 'default'}
              onPress={() => setPrice(price === pt ? null : pt)}
            >
              {'$'.repeat(pt)}
            </Chip>
          ))}
        </ChipRail>

        {/* Sector on its own line — the highest-value filter for a barrio-driven city. */}
        <ChipRail className="mt-2">
          {neighborhoods.data?.neighborhoods.map((n) => (
            <Chip
              key={n.slug}
              size="sm"
              state={hood === n.slug ? 'selected' : 'default'}
              onPress={() => setHood(hood === n.slug ? null : n.slug)}
            >
              {n.name}
            </Chip>
          ))}
        </ChipRail>

        {(cuisines.data?.cuisines.length ?? 0) > 0 && (
          <ChipRail className="mt-2">
            {cuisines.data?.cuisines.map((cz) => (
              <Chip
                key={cz}
                size="sm"
                state={cuisine === cz ? 'selected' : 'default'}
                onPress={() => setCuisine(cuisine === cz ? null : cz)}
              >
                {cuisineLabel(cz)}
              </Chip>
            ))}
          </ChipRail>
        )}

        <View className="mt-4">
          {members.length > 0 && (
            <>
              <SectionHeader>Miembros</SectionHeader>
              {members.map((m) => (
                <MemberRow key={m.id} m={m} />
              ))}
            </>
          )}

          {results.isPending ? (
            <Body>Buscando…</Body>
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
        <Text className="w-5 font-mono text-[11px] text-text-muted">{index + 1}</Text>
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
            neighborhood={r.neighborhood}
            hours={r.closesAt ? `hasta ${r.closesAt}` : null}
          />
        </View>
        {r.friendCount > 0 && r.friendAvg != null ? (
          <ScoreBadge
            size="sm"
            score={r.friendAvg}
            attribution={{ kind: 'friends', count: r.friendCount }}
          />
        ) : r.isNew ? (
          <Text className="font-mono text-[10px] text-accent-strong uppercase tracking-eyebrow">
            Sé el primero
          </Text>
        ) : null}
      </Pressable>
    </Link>
  )
}

// A member result row — links to their passport.
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
