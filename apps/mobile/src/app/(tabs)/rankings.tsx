import { RANK_FAB_CLEARANCE } from '@/components/RankFab'
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
import { ShareIcon, SortIcon } from '@/components/ui/icons'
import { Characteristics } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { showActionSheet } from '@/lib/actionSheet'
import { api } from '@/lib/api'
import { cuisineLabel, displayScore, priceLabel, tagLabel } from '@/lib/display'
import { cloudinaryUrl } from '@/lib/media'
import { removeRankingWithUndo } from '@/lib/rankingRemoval'
import {
  NO_FILTERS,
  type RankingFilters,
  SORT_OPTIONS,
  type SortKey,
  activeFilterCount,
  applyFilters,
  deriveFilterOptions,
  filterChipLabel,
  sortLabel,
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
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
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
  const indicator = useResolvedTheme() === 'candlelit' ? ('white' as const) : ('black' as const)
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>()
  const [tab, setTab] = useState<'mine' | 'saved' | 'barrios'>(
    tabParam === 'saved' ? 'saved' : tabParam === 'barrios' ? 'barrios' : 'mine',
  )
  const [sort, setSort] = useState<SortKey>('position')
  const [filters, setFilters] = useState<RankingFilters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const me = useProfile(true, 300_000)

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
    const idx = await showActionSheet({
      title: 'Ordenar por',
      options: SORT_OPTIONS.map((o) => ({ label: o.label })),
    })
    if (idx != null) setSort(SORT_OPTIONS[idx].key)
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
          <Eyebrow>Tu lista</Eyebrow>
          <Title className="mb-3">Rankings</Title>
        </View>
        {ranked.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartir mi lista"
            onPress={shareList}
            className="h-10 w-10 items-center justify-center rounded-pill border border-line active:opacity-70"
          >
            <ShareIcon size={18} />
          </Pressable>
        )}
      </View>

      {stats.data && (
        <View className="mb-4 flex-row gap-6">
          <Stat n={String(stats.data.places)} l="lugares" />
          <Stat
            n={stats.data.avgScore != null ? displayScore(stats.data.avgScore) : '—'}
            l="prom."
          />
          <Stat n={stats.data.streakWeeks > 0 ? `${stats.data.streakWeeks} sem.` : '—'} l="racha" />
        </View>
      )}

      <View className="mb-4 flex-row gap-2">
        <Chip state={tab === 'mine' ? 'selected' : 'default'} onPress={() => setTab('mine')}>
          Mía
        </Chip>
        <Chip state={tab === 'saved' ? 'selected' : 'default'} onPress={() => setTab('saved')}>
          Quiero probar
        </Chip>
        <Chip state={tab === 'barrios' ? 'selected' : 'default'} onPress={() => setTab('barrios')}>
          Sectores
        </Chip>
      </View>
    </>
  )

  // Sort + filter — the "mine" tab only, and only once there's a list to act on.
  const mineControls = ranked.length > 0 && (
    <View className="mb-4 gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Chip size="sm" icon={<SortIcon size={12} />} onPress={openSort}>
          {sortLabel(sort)}
        </Chip>
        <Chip
          size="sm"
          state={filterOpen ? 'active' : activeCount > 0 ? 'selected' : 'default'}
          onPress={() => setFilterOpen((v) => !v)}
        >
          {activeCount > 0 ? `Filtros (${activeCount})` : 'Filtros'}
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
            <Caption className="font-mono text-accent-strong">Limpiar</Caption>
          </Pressable>
        )}
      </View>

      {filterOpen && (
        <View className="gap-3 rounded border border-line bg-surface p-3">
          <FilterGroup
            label="Sector"
            values={filterOptions.sectors}
            selected={filters.sector}
            render={(v) => String(v)}
            onToggle={(v) =>
              setFilters((f) => ({ ...f, sector: f.sector === v ? null : String(v) }))
            }
          />
          <FilterGroup
            label="Ocasión"
            values={filterOptions.occasions}
            selected={filters.occasion}
            render={(v) => tagLabel(String(v))}
            onToggle={(v) =>
              setFilters((f) => ({ ...f, occasion: f.occasion === v ? null : String(v) }))
            }
          />
          <FilterGroup
            label="Precio"
            values={filterOptions.prices}
            selected={filters.price}
            render={(v) => priceLabel(Number(v)) ?? String(v)}
            onToggle={(v) => setFilters((f) => ({ ...f, price: f.price === v ? null : Number(v) }))}
          />
          <FilterGroup
            label="Cocina"
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
              <ErrorState onRetry={() => mine.refetch()}>
                No se pudieron cargar tus rankings.
              </ErrorState>
            ) : activeCount > 0 ? (
              <EmptyState
                body="Ningún ranking coincide con estos filtros."
                action={
                  <Button size="sm" variant="secondary" onPress={() => setFilters(NO_FILTERS)}>
                    Limpiar filtros
                  </Button>
                }
              >
                Nada coincide.
              </EmptyState>
            ) : (
              <EmptyState
                body="Rankea un spot y ocupa su puesto en tu pasaporte."
                action={
                  <Button size="sm" variant="primary" onPress={() => router.push('/rank')}>
                    Rankear un spot
                  </Button>
                }
              >
                Tu lista está vacía.
              </EmptyState>
            )
          }
          indicatorStyle={indicator}
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: RANK_FAB_CLEARANCE }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        />
      ) : (
        <ScrollView
          indicatorStyle={indicator}
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: RANK_FAB_CLEARANCE }}
        >
          {topMatter}
          {tab === 'barrios' ? (
            <BarriosView rankings={ranked} />
          ) : saved.isPending ? (
            <Skeleton height={64} />
          ) : saved.data && saved.data.saved.length > 0 ? (
            saved.data.saved.map((s) => <SavedRow key={s.restaurant.id} saved={s} />)
          ) : (
            <EmptyState
              body="Los lugares que quieras probar se juntarán aquí."
              action={
                <Button size="sm" variant="secondary" onPress={() => router.push('/explore')}>
                  Explorar spots
                </Button>
              }
            >
              Nada guardado todavía.
            </EmptyState>
          )}
        </ScrollView>
      )}
    </View>
  )
}

// One dimension of the filter panel — a mono label over a wrapping row of chips.
function FilterGroup({
  label,
  values,
  selected,
  render,
  onToggle,
}: {
  label: string
  values: (string | number)[]
  selected: string | number | null
  render: (v: string | number) => string
  onToggle: (v: string | number) => void
}) {
  if (values.length === 0) return null
  return (
    <View>
      <Eyebrow className="mb-2 font-mono">{label}</Eyebrow>
      <View className="flex-row flex-wrap gap-2">
        {values.map((v) => (
          <Chip
            key={String(v)}
            size="sm"
            state={selected === v ? 'selected' : 'default'}
            onPress={() => onToggle(v)}
          >
            {render(v)}
          </Chip>
        ))}
      </View>
    </View>
  )
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <View>
      <Text style={DATA_FIGURES} className="font-serif text-serif-lg text-text">
        {n}
      </Text>
      <Caption>{l}</Caption>
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
          accessibilityLabel="Quitar"
          onPress={() => {
            // Close first: the row is removed optimistically, and a half-open
            // swipeable left behind reads as a stuck row.
            ref.current?.close()
            onRemove()
          }}
          className="w-[88px] items-center justify-center bg-status-packed active:opacity-80"
        >
          <Text className="font-ui-medium text-label text-on-accent">Quitar</Text>
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
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ranking.note ?? '')

  const saveNote = useMutation({
    mutationFn: () => api.patch(`/rankings/${ranking.id}/note`, { body: draft.trim() }),
    onSuccess: () => {
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['rankings'] })
    },
    onError: () =>
      toast({
        variant: 'error',
        message: 'No se pudo guardar la nota',
        action: { label: 'Intentar de nuevo', onClick: () => saveNote.mutate() },
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
          <Link href={`/r/${ranking.restaurant.id}`}>
            <Text className="font-serif text-serif-md text-text">{ranking.restaurant.name}</Text>
          </Link>
          <Characteristics
            priceTier={ranking.restaurant.priceTier}
            cuisine={ranking.restaurant.cuisine}
            neighborhood={ranking.neighborhood}
          />
          {(ranking.favoriteDish || (ranking.tags?.length ?? 0) > 0) && !editing && (
            <View className="mt-1 flex-row flex-wrap items-center gap-2">
              {ranking.favoriteDish && (
                <Caption className="text-text-2">Pide: {ranking.favoriteDish}</Caption>
              )}
              {(ranking.tags ?? []).map((t) => (
                <Caption key={t} className="font-mono text-micro">
                  {tagLabel(t)}
                </Caption>
              ))}
            </View>
          )}
          {editing ? (
            <View className="mt-2 gap-2">
              <TextInput
                className="min-h-[64px] rounded border border-line bg-surface p-3 font-ui text-body text-text"
                placeholderTextColor={placeholder}
                placeholder="Una línea sobre por qué…"
                maxLength={140}
                multiline
                inputAccessoryViewID="ranking-note"
                value={draft}
                onChangeText={setDraft}
              />
              <View className="flex-row gap-4">
                <ActionText disabled={saveNote.isPending} onPress={() => saveNote.mutate()}>
                  Guardar
                </ActionText>
                <ActionText
                  onPress={() => {
                    setDraft(ranking.note ?? '')
                    setEditing(false)
                  }}
                >
                  Cancelar
                </ActionText>
              </View>
            </View>
          ) : (
            <>
              {ranking.note ? <SerifNote>{ranking.note}</SerifNote> : null}
              <View className="mt-2 flex-row gap-4">
                <ActionText onPress={() => setEditing(true)}>
                  {ranking.note ? 'Editar nota' : 'Agregar nota'}
                </ActionText>
                <ActionText danger onPress={() => removeRankingWithUndo(ranking)}>
                  Quitar
                </ActionText>
              </View>
            </>
          )}
        </View>
        <Text style={DATA_FIGURES} className="font-serif text-serif-lg text-accent">
          {displayScore(ranking.score)}
        </Text>
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

function BarriosView({ rankings }: { rankings: Ranking[] }) {
  const router = useRouter()
  const byHood = new Map<string, { count: number; sum: number }>()
  for (const r of rankings) {
    const hood = r.neighborhood ?? 'Santo Domingo'
    const cur = byHood.get(hood) ?? { count: 0, sum: 0 }
    byHood.set(hood, { count: cur.count + 1, sum: cur.sum + r.score })
  }
  const hoods = [...byHood.entries()]
    .map(([name, v]) => ({ name, count: v.count, avg: v.sum / v.count }))
    .sort((a, b) => b.count - a.count)
  const max = hoods[0]?.count ?? 1
  if (hoods.length === 0)
    return (
      <EmptyState
        action={
          <Button size="sm" variant="primary" onPress={() => router.push('/rank')}>
            Rankear un spot
          </Button>
        }
      >
        Rankea algunos lugares primero.
      </EmptyState>
    )
  return (
    <View className="gap-4">
      {hoods.map((h) => (
        <View key={h.name}>
          <View className="flex-row items-baseline justify-between">
            <Text className="font-serif text-serif-md text-text">{h.name}</Text>
            <Caption>
              {h.count} · prom. {displayScore(h.avg)}
            </Caption>
          </View>
          <View className="mt-1 h-1 rounded-pill bg-bg-sunk">
            <View
              className="h-1 rounded-pill bg-accent-fill"
              style={{ width: `${(h.count / max) * 100}%` }}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

function SavedRow({ saved }: { saved: SavedPlace }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const remove = useMutation({
    mutationFn: () => api.del(`/saved/${saved.restaurant.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved'] }),
    onError: () =>
      toast({
        variant: 'error',
        message: 'No se pudo quitar de tu lista',
        action: { label: 'Intentar de nuevo', onClick: () => remove.mutate() },
      }),
  })
  return (
    <SwipeToRemove onRemove={() => remove.mutate()}>
      <View className="flex-row items-center justify-between border-b border-line py-3">
        <View className="flex-1 pr-3">
          <Text className="font-serif text-serif-md text-text">{saved.restaurant.name}</Text>
          <Characteristics
            priceTier={saved.restaurant.priceTier}
            cuisine={saved.restaurant.cuisine}
            neighborhood={saved.neighborhood}
          />
        </View>
        <View className="flex-none flex-row items-center gap-3">
          <Button
            variant="secondary"
            className="w-auto min-h-[40px] px-4"
            onPress={() => router.push(`/rank?restaurant=${saved.restaurant.id}`)}
          >
            Rankear
          </Button>
          <ActionText danger disabled={remove.isPending} onPress={() => remove.mutate()}>
            {remove.isPending ? 'Quitando…' : 'Quitar'}
          </ActionText>
        </View>
      </View>
    </SwipeToRemove>
  )
}
