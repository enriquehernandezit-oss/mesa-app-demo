import { ExternalResults } from '@/components/ExternalResults'
import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  ChipRail,
  Eyebrow,
  RowsSkeleton,
  SerifItalic,
  Title,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { CompareCard } from '@/components/ui/CompareCard'
import { Field } from '@/components/ui/Field'
import { KeyboardDone } from '@/components/ui/KeyboardDone'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { Characteristics } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { ApiError, api } from '@/lib/api'
import { OCCASION_TAGS, displayScore, scoreForPosition } from '@/lib/display'
import { formatDistance, haversineM } from '@/lib/geo'
import { tapSuccess } from '@/lib/haptics'
import {
  type PairwiseState,
  type Sentiment,
  choose,
  comparisonsLeft,
  initInsertBounded,
  isDone,
  nextComparison,
  tie,
} from '@/lib/pairwise'
import { markRankExplainerSeen, rankExplainerSeen } from '@/lib/rankExplainer'
import type { NewRestaurant, Ranking, RestaurantProfileResponse, SavedPlace } from '@/lib/types'
import { useExternalPlaceSearch } from '@/lib/useExternalPlaceSearch'
import { useMyLocation } from '@/lib/useMyLocation'
import { useColor } from '@/theme/useColor'
import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Rank-a-place (Phase 6 mocks B1–B4): find the spot (merged ranked + unranked
// rows, or add one that isn't on Mesa), place it with photo-backed compare cards
// + "Más o menos igual", reveal the score, then add a note / occasion tags / a
// dish. Ported from apps/app/src/screens/rank/RankAPlace.tsx.
//
// The "Cerca" (location) filter + distance is wired via expo-location, the
// success haptic via expo-haptics, and the Google external-search gap-filler via
// useExternalPlaceSearch (all N6 / shared with Explore). The manual "add a place"
// form is pure API, as is the whole find → compare → reveal → note loop.

type Item = {
  id: string
  name: string
  cuisine: string | null
  coverImageId?: string | null
  neighborhood: string | null
  priceTier?: number | null
  closesAt?: string | null
  phone?: string | null
  lat?: number
  lng?: number
  score?: number // present when it's already on your list
}

type AddPlaceMutation = UseMutationResult<
  { restaurant: NewRestaurant },
  Error,
  { name: string; neighborhoodSlug: string }
>

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export default function RankAPlace() {
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ restaurant?: string }>()

  const mine = useQuery({
    queryKey: ['rankings'],
    queryFn: () => api.get<{ rankings: Ranking[] }>('/rankings'),
  })
  // Want-to-try order — the honest "recency" signal for the find-step's lead
  // group (a saved place is a real signal the user meant to come back and rank).
  const saved = useQuery({
    queryKey: ['saved'],
    queryFn: () => api.get<{ saved: SavedPlace[] }>('/saved'),
  })

  const [pickedId, setPickedId] = useState<string | null>(params.restaurant ?? null)
  const [addedPlace, setAddedPlace] = useState<Item | null>(null)
  const [pickQuery, setPickQuery] = useState('')
  const [openNow, setOpenNow] = useState(false)
  const [reserveOnly, setReserveOnly] = useState(false)
  const [nearby, setNearby] = useState(false)
  const me = useProfile(true, 300_000)
  const myHood = me.data?.profile.neighborhood?.name ?? null

  // Query-driven, mirroring Explore: the server searches (mesa_norm + trigram)
  // and bounds the result. No debounce — every keystroke past 2 chars refetches.
  const candidates = useQuery({
    queryKey: ['rankings', 'candidates', pickQuery.trim(), openNow, reserveOnly],
    queryFn: () => {
      const p = new URLSearchParams()
      if (pickQuery.trim().length >= 2) p.set('q', pickQuery.trim())
      if (openNow) p.set('open', '1')
      if (reserveOnly) p.set('reserve', '1')
      return api.get<{ restaurants: Item[] }>(`/rankings/candidates?${p}`)
    },
  })

  const [sentiment, setSentiment] = useState<Sentiment | null>(null)
  const [position, setPosition] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [dish, setDish] = useState('')
  const [chainDish, setChainDish] = useState(false)
  const [placedStamp, setPlacedStamp] = useState(false)

  // My already-ranked places → Items carrying their score (merged rows + re-rank).
  const existing: Item[] = useMemo(
    () =>
      (mine.data?.rankings ?? []).map((r) => ({
        id: r.restaurant.id,
        name: r.restaurant.name,
        cuisine: r.restaurant.cuisine,
        coverImageId: r.restaurant.coverImageId,
        neighborhood: r.neighborhood,
        priceTier: r.restaurant.priceTier,
        closesAt: r.restaurant.closesAt,
        phone: r.restaurant.phone,
        lat: r.restaurant.lat,
        lng: r.restaurant.lng,
        score: r.score,
      })),
    [mine.data],
  )
  const candList = candidates.data?.restaurants ?? []
  const wantToTryIds = useMemo(
    () =>
      [...(saved.data?.saved ?? [])]
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map((s) => s.restaurant.id),
    [saved.data],
  )

  // Resolve the picked spot from candidates, my list, or a just-added place.
  const picked = useMemo<Item | null>(() => {
    if (!pickedId) return null
    return (
      candList.find((r) => r.id === pickedId) ??
      existing.find((r) => r.id === pickedId) ??
      (addedPlace?.id === pickedId ? addedPlace : null)
    )
  }, [pickedId, candList, existing, addedPlace])
  const isRerank = Boolean(pickedId && existing.some((r) => r.id === pickedId))
  const existingForCompare = useMemo(
    () => (isRerank ? existing.filter((r) => r.id !== pickedId) : existing),
    [isRerank, existing, pickedId],
  )

  // Commits the ranking the moment its score is revealed — not at "Guardar nota"
  // — so an interrupted flow never loses the ranking itself (only the optional
  // note/tags/dish). The note step re-POSTs the same pair, which the API upserts.
  const commitInitial = useMutation({
    mutationFn: (pos: number) => api.post('/rankings', { restaurantId: pickedId, position: pos }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankings'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['restaurant', pickedId] })
    },
  })
  const committedForId = useRef<string | null>(null)
  useEffect(() => {
    if (pickedId && position !== null && committedForId.current !== pickedId) {
      committedForId.current = pickedId
      commitInitial.mutate(position)
    }
  }, [pickedId, position, commitInitial.mutate])

  // The friend signal for the reveal screen — the same profile data the
  // restaurant page shows, fetched once the score is on screen.
  const friendsQuery = useQuery({
    queryKey: ['restaurant', pickedId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${pickedId}`),
    enabled: Boolean(pickedId) && position !== null,
    staleTime: 30_000,
  })

  const finishToRankings = () => {
    setPlacedStamp(true)
    tapSuccess()
    setTimeout(() => router.replace('/rankings'), 1300)
  }

  const save = useMutation({
    mutationFn: (pos: number) =>
      api.post('/rankings', {
        restaurantId: pickedId,
        position: pos,
        vibeNote: note.trim() || undefined,
        tags: tags.length ? tags : undefined,
        favoriteDish: dish.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankings'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['restaurant', pickedId] })
      if (chainDish && pickedId) {
        router.replace(`/dish?restaurant=${pickedId}`)
      } else {
        finishToRankings()
      }
    },
    onError: (_err, pos) => {
      toast({
        variant: 'error',
        message: 'No se pudo guardar tu nota',
        action: { label: 'Intentar de nuevo', onClick: () => save.mutate(pos) },
      })
    },
  })

  const deepLinked = Boolean(params.restaurant || addedPlace)
  const inFlow = pickedId !== null && !placedStamp

  // Guard the multi-step flow against the platform back-gesture / Android back.
  // The whole flow lives at one route on local state, so without this a single
  // edge-swipe would unwind straight out and silently lose an in-progress
  // ranking. Instead we intercept the screen-remove and consume BACK as one
  // in-flow step (mirroring the in-app "‹ Atrás" controls), only letting it
  // leave once there's nothing left to unwind. `inFlow` goes false at the find
  // step and after the stamp, so the success/dish-chain navigation passes
  // through. This is expo-router's supported beforeRemove path — the RN
  // equivalent of the web app's useBlocker (SDK 56+ forbids importing
  // usePreventRemove from @react-navigation directly).
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (!inFlow) return
      e.preventDefault()
      if (revealed) {
        setRevealed(false)
      } else if (position !== null) {
        committedForId.current = null // re-arm auto-commit if they redo comparisons
        setPosition(null)
      } else if (sentiment !== null) {
        setSentiment(null)
      } else if (!deepLinked) {
        setPickedId(null)
      } else {
        navigation.dispatch(e.data.action) // arrived straight in — let back leave
      }
    })
    return sub
  }, [navigation, inFlow, revealed, position, sentiment, deepLinked])

  const addPlace = useMutation({
    mutationFn: (body: { name: string; neighborhoodSlug: string }) =>
      api.post<{ restaurant: NewRestaurant }>('/restaurants', body),
    onSuccess: ({ restaurant }) => {
      const item: Item = {
        id: restaurant.id,
        name: restaurant.name,
        cuisine: restaurant.cuisine,
        coverImageId: restaurant.coverImageId,
        neighborhood: restaurant.neighborhood,
        priceTier: restaurant.priceTier,
      }
      setAddedPlace(item)
      setPickedId(item.id)
      queryClient.invalidateQueries({ queryKey: ['rankings', 'candidates'] })
      queryClient.invalidateQueries({ queryKey: ['explore'] })
    },
    onError: (err) => {
      const capped = err instanceof ApiError && err.status === 429
      toast({
        variant: 'error',
        message: capped ? 'Llegaste al límite de lugares por hoy.' : 'No se pudo agregar el lugar.',
      })
    },
  })

  // Tapping a Google suggestion in the find step creates a real, populated
  // profile immediately (M9) and continues the rank flow with it — treated
  // exactly like a hand-added place.
  const onGoogleCreated = (restaurant: NewRestaurant) => {
    setAddedPlace({
      id: restaurant.id,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      coverImageId: restaurant.coverImageId,
      neighborhood: restaurant.neighborhood,
      priceTier: restaurant.priceTier,
    })
    setPickedId(restaurant.id)
    queryClient.invalidateQueries({ queryKey: ['rankings', 'candidates'] })
  }

  // The celebration stamp — "#3 · Mijas" punches in over the screen.
  if (placedStamp && picked && position !== null) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-bg px-5">
        {/* The stamp punches in — it already fires tapSuccess, and a celebration
            that appears instantly reads as a screen change, not an event. */}
        <Animated.View
          entering={ZoomIn.springify().damping(12)}
          className="h-28 w-28 items-center justify-center rounded-pill border-2 border-accent"
        >
          <Text className="font-serif text-display text-accent">#{position}</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150)} className="items-center gap-3">
          <Text className="font-serif text-serif-lg text-text">{picked.name}</Text>
          <Caption>añadido a tu pasaporte</Caption>
        </Animated.View>
      </View>
    )
  }

  if (candidates.isPending || mine.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <RowsSkeleton rows={5} thumb={56} />
      </View>
    )
  }

  // B1 — Find the place.
  if (!picked) {
    return (
      <FindStep
        candList={candList}
        existing={existing}
        wantToTryIds={wantToTryIds}
        query={pickQuery}
        setQuery={setPickQuery}
        openNow={openNow}
        setOpenNow={setOpenNow}
        reserveOnly={reserveOnly}
        setReserveOnly={setReserveOnly}
        nearby={nearby}
        setNearby={setNearby}
        myHood={myHood}
        onPick={setPickedId}
        addPlace={addPlace}
        onGoogleCreated={onGoogleCreated}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/rankings'))}
      />
    )
  }

  // B3 — the score reveal.
  if (position !== null && !revealed) {
    return (
      <RevealStep
        picked={picked}
        position={position}
        existingForCompare={existingForCompare}
        friendsPending={friendsQuery.isPending}
        friendsRankings={friendsQuery.data?.friendsRankings ?? []}
        friendAvg={friendsQuery.data?.friendAvg ?? 0}
        commitError={commitInitial.isError}
        onRetryCommit={() => commitInitial.mutate(position)}
        onBack={() => {
          committedForId.current = null
          setPosition(null)
        }}
        onDone={finishToRankings}
        onAddNote={() => setRevealed(true)}
      />
    )
  }

  // B4 — note + occasion tags + a dish.
  if (position !== null) {
    return (
      <NoteStep
        picked={picked}
        position={position}
        existingCount={existingForCompare.length}
        note={note}
        setNote={setNote}
        tags={tags}
        setTags={setTags}
        dish={dish}
        setDish={setDish}
        chainDish={chainDish}
        setChainDish={setChainDish}
        saving={save.isPending}
        onBack={() => setRevealed(false)}
        onSave={() => save.mutate(position)}
      />
    )
  }

  // Sentiment — how did it feel? Narrows the comparison band.
  if (!sentiment) {
    return (
      <StepScreen>
        <BackBar
          label="‹ Atrás"
          onBack={() => {
            if (deepLinked) router.replace('/rankings')
            else setPickedId(null)
          }}
        />
        <View className="mt-4 items-center gap-1">
          <Eyebrow>{picked.name}</Eyebrow>
          <Title>¿Cómo estuvo?</Title>
        </View>
        <View className="mt-6 gap-3">
          <SentimentButton tone="loved" onPress={() => setSentiment('loved')}>
            Me encantó
          </SentimentButton>
          <SentimentButton tone="fine" onPress={() => setSentiment('fine')}>
            Estuvo bien
          </SentimentButton>
          <SentimentButton tone="low" onPress={() => setSentiment('disliked')}>
            No me convenció
          </SentimentButton>
        </View>
      </StepScreen>
    )
  }

  // B2 — pairwise placement, banded by sentiment.
  return (
    <StepScreen>
      <BackBar label="‹ Atrás" onBack={() => setSentiment(null)} />
      <PlaceStep
        existing={existingForCompare}
        item={picked}
        sentiment={sentiment}
        isRerank={isRerank}
        onPlaced={setPosition}
      />
    </StepScreen>
  )
}

// Safe-area screen wrapper for the flow's non-scrolling steps.
function StepScreen({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      {children}
    </View>
  )
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onBack}
      className="min-h-[44px] self-start justify-center active:opacity-60"
    >
      <Text className="font-ui-medium text-label text-text-muted">{label}</Text>
    </Pressable>
  )
}

function SentimentButton({
  tone,
  children,
  onPress,
}: { tone: 'loved' | 'fine' | 'low'; children: React.ReactNode; onPress: () => void }) {
  const border = tone === 'loved' ? 'border-accent' : tone === 'low' ? 'border-line' : 'border-line'
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-[56px] items-center justify-center rounded border ${border} bg-surface active:opacity-80`}
    >
      <Text className="font-serif text-serif-md text-text">{children}</Text>
    </Pressable>
  )
}

// B3 — the score reveal. Pure presentation of where the spot landed (its
// neighbours + the friend signal); the parent already committed the ranking.
function RevealStep({
  picked,
  position,
  existingForCompare,
  friendsPending,
  friendsRankings,
  friendAvg,
  commitError,
  onRetryCommit,
  onBack,
  onDone,
  onAddNote,
}: {
  picked: Item
  position: number
  existingForCompare: Item[]
  friendsPending: boolean
  friendsRankings: RestaurantProfileResponse['friendsRankings']
  friendAvg: number
  commitError: boolean
  onRetryCommit: () => void
  onBack: () => void
  onDone: () => void
  onAddNote: () => void
}) {
  const insets = useSafeAreaInsets()
  const orderedByPos = [...existingForCompare].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const total = orderedByPos.length + 1
  const score = scoreForPosition(position - 1, total)
  const around: { pos: number; name: string; score: number; isNew: boolean }[] = []
  for (const pos of [position - 1, position, position + 1]) {
    if (pos < 1 || pos > total) continue
    if (pos === position) {
      around.push({ pos, name: picked.name, score, isNew: true })
    } else {
      const r = orderedByPos[pos < position ? pos - 1 : pos - 2]
      if (r)
        around.push({ pos, name: r.name, score: scoreForPosition(pos - 1, total), isNew: false })
    }
  }
  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <View className="flex-row items-center justify-between">
        <BackBar label="‹ Atrás" onBack={onBack} />
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
            Listo
          </Text>
        </Pressable>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-6"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center">
          <Eyebrow>Tu puntuación</Eyebrow>
          <Text className="font-serif text-display text-accent">{displayScore(score)}</Text>
          <Title className="mt-1">{picked.name}</Title>
          <Characteristics
            priceTier={picked.priceTier}
            cuisine={picked.cuisine}
            neighborhood={picked.neighborhood}
          />
          <Chip size="sm" state="selected" className="mt-3">
            #{position} de {total} en tu lista
          </Chip>
        </View>

        <View className="mt-6 gap-1">
          {around.map((n) => (
            <View
              key={n.pos}
              className={`flex-row items-center gap-3 rounded px-3 py-2 ${n.isNew ? 'bg-accent-fill' : ''}`}
            >
              <Text className="w-6 font-serif text-serif-md text-text-muted">{n.pos}</Text>
              <Text className="flex-1 font-serif text-serif-md text-text" numberOfLines={1}>
                {n.name}
              </Text>
              <Text className="font-serif text-serif-md text-accent">{displayScore(n.score)}</Text>
            </View>
          ))}
        </View>

        {/* The other half of the core loop: where friends put this same place. */}
        <View className="mt-6">
          <Eyebrow>Tus amigos</Eyebrow>
          {friendsPending ? (
            <Caption className="mt-1">Buscando…</Caption>
          ) : friendsRankings.length > 0 ? (
            <>
              <Caption className="mt-1">
                {friendsRankings.length === 1
                  ? '1 amigo rankeó esto'
                  : `${friendsRankings.length} amigos rankearon esto`}{' '}
                · prom. {displayScore(friendAvg)}
              </Caption>
              {friendsRankings.slice(0, 3).map((f) => (
                <Link key={f.user.id} href={`/u/${f.user.id}`} asChild>
                  <Pressable className="mt-2 flex-row items-center gap-3 active:opacity-80">
                    <Avatar
                      name={f.user.name || f.user.handle || 'm'}
                      src={f.user.image}
                      size={28}
                    />
                    <Text className="flex-1 font-ui-medium text-body text-text" numberOfLines={1}>
                      {f.user.name || f.user.handle}
                    </Text>
                    <Text className="font-mono text-eyebrow text-text-muted">#{f.position}</Text>
                    <Text className="font-serif text-serif-md text-accent">
                      {displayScore(f.score)}
                    </Text>
                  </Pressable>
                </Link>
              ))}
            </>
          ) : (
            <SerifItalic className="mt-1 text-serif-sm">
              Ninguno de tus amigos ha rankeado esto todavía — vas primero.
            </SerifItalic>
          )}
        </View>

        {commitError && (
          <View className="mt-4 flex-row items-center justify-center gap-3">
            <Caption>No se pudo guardar este ranking.</Caption>
            <Pressable
              accessibilityRole="button"
              onPress={onRetryCommit}
              className="active:opacity-60"
            >
              <Text className="font-ui-medium text-label text-accent-strong">Reintentar</Text>
            </Pressable>
          </View>
        )}
        <Body className="mt-6 text-center text-text-muted">
          Tu respuesta movió a {picked.name}, no la puntuación del spot.
        </Body>
        <View className="mt-4">
          <Button variant="primary" onPress={onAddNote}>
            Agregar una nota
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}

// B4 — note + occasion tags + a dish. The ranking already saved on reveal; this
// only finalizes the optional note/tags and whether to chain into the composer.
function NoteStep({
  picked,
  position,
  existingCount,
  note,
  setNote,
  tags,
  setTags,
  dish,
  setDish,
  chainDish,
  setChainDish,
  saving,
  onBack,
  onSave,
}: {
  picked: Item
  position: number
  existingCount: number
  note: string
  setNote: Dispatch<SetStateAction<string>>
  tags: string[]
  setTags: Dispatch<SetStateAction<string[]>>
  dish: string
  setDish: Dispatch<SetStateAction<string>>
  chainDish: boolean
  setChainDish: Dispatch<SetStateAction<boolean>>
  saving: boolean
  onBack: () => void
  onSave: () => void
}) {
  const insets = useSafeAreaInsets()
  const placeholder = useColor('text-muted')
  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <View className="flex-row items-center justify-between">
        <BackBar label="‹ Agregar nota" onBack={onBack} />
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={onSave}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
            Listo
          </Text>
        </Pressable>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-6"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center gap-3 border-line border-b pb-4">
          <PlaceCover
            seed={picked.id}
            name={picked.name}
            coverImageId={picked.coverImageId}
            size={{ w: 120, h: 120 }}
            className="h-14 w-14"
          />
          <View className="flex-1">
            <Text className="font-serif text-serif-md text-text">{picked.name}</Text>
            <Characteristics
              priceTier={picked.priceTier}
              cuisine={picked.cuisine}
              neighborhood={picked.neighborhood}
            />
          </View>
          <Text className="font-serif text-serif-lg text-accent">
            {displayScore(scoreForPosition(position - 1, existingCount + 1))}
          </Text>
        </View>

        <TextInput
          className="mt-4 min-h-[84px] rounded border border-line bg-surface p-3 font-ui text-body text-text"
          placeholderTextColor={placeholder}
          placeholder="con velas, vino natural, pide el branzino…"
          maxLength={140}
          multiline
          inputAccessoryViewID="rank-note"
          value={note}
          onChangeText={setNote}
        />

        <KeyboardDone id="rank-note" />

        <Eyebrow className="mt-4 font-mono">Ocasión</Eyebrow>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {OCCASION_TAGS.map((t) => {
            const on = tags.includes(t)
            return (
              <Chip
                key={t}
                size="sm"
                state={on ? 'selected' : 'default'}
                onPress={() =>
                  setTags((cur) =>
                    on ? cur.filter((x) => x !== t) : cur.length < 4 ? [...cur, t] : cur,
                  )
                }
              >
                {t}
              </Chip>
            )
          })}
        </View>

        <Eyebrow className="mt-4 font-mono">Qué pedir</Eyebrow>
        <Field
          className="mt-2"
          placeholder="branzino, vino natural…"
          maxLength={60}
          returnKeyType="done"
          value={dish}
          onChangeText={setDish}
        />

        <Eyebrow className="mt-4 font-mono">Foto del plato</Eyebrow>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: chainDish }}
          onPress={() => setChainDish((v) => !v)}
          className={`mt-2 min-h-[56px] flex-row items-center gap-3 rounded border px-4 ${chainDish ? 'border-accent bg-accent-fill' : 'border-line border-dashed'} active:opacity-80`}
        >
          <Text className="font-serif text-serif-lg text-accent">+</Text>
          <Text className="font-ui text-body text-text">
            {chainDish ? 'Foto después de publicar' : 'Agregar una foto'}
          </Text>
        </Pressable>

        <View className="mt-6">
          <Button variant="primary" disabled={saving} onPress={onSave}>
            {saving ? 'Guardando…' : 'Guardar nota'}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}

function PlaceStep({
  existing,
  item,
  sentiment,
  isRerank,
  onPlaced,
}: {
  existing: Item[]
  item: Item
  sentiment: Sentiment
  isRerank: boolean
  onPlaced: (position: number) => void
}) {
  const initial = useMemo(
    () => initInsertBounded(existing, item, sentiment),
    [existing, item, sentiment],
  )
  const [state, setState] = useState<PairwiseState<Item>>(initial)
  const [answered, setAnswered] = useState(0)
  const [showCoach, setShowCoach] = useState(false)
  // First-run coachmark — read the persisted flag once, show only if unseen.
  useEffect(() => {
    let live = true
    rankExplainerSeen().then((seen) => {
      if (live && !seen) setShowCoach(true)
    })
    return () => {
      live = false
    }
  }, [])
  const comparison = nextComparison(state)
  const done = comparison === null && isDone(state)

  useEffect(() => {
    if (!done) return
    const pos = state.ordered.findIndex((x) => x.id === item.id) + 1
    onPlaced(pos > 0 ? pos : 1)
  }, [done, state.ordered, item.id, onPlaced])

  if (comparison === null) {
    return <Body className="mt-6">Ubicando…</Body>
  }

  const step = answered + 1
  const total = answered + comparisonsLeft(state)
  const pivotPos = state.ordered.findIndex((x) => x.id === comparison.pivot.id) + 1

  return (
    <View className="mt-4 gap-4">
      <Text className="font-mono text-eyebrow text-text-muted">
        {step} de {total}
      </Text>
      <View className="items-center gap-1">
        <Title>¿Cuál estuvo mejor?</Title>
        <Text className="text-center font-mono text-eyebrow text-text-muted">
          Tu respuesta mueve a {item.name}, no la puntuación del spot.
        </Text>
      </View>
      <View className="gap-3">
        <CompareCard
          item={comparison.current}
          subline={isRerank ? 'ya en tu lista' : 'nuevo en tu lista'}
          onPress={() => {
            setAnswered((a) => a + 1)
            setState((s) => choose(s, true))
          }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setAnswered((a) => a + 1)
            setState((s) => tie(s))
          }}
          className="min-h-[44px] items-center justify-center rounded-pill border border-line active:opacity-70"
        >
          <Text className="font-mono text-eyebrow text-text-muted uppercase tracking-eyebrow">
            Más o menos igual
          </Text>
        </Pressable>
        <CompareCard
          item={comparison.pivot}
          subline={`#${pivotPos} en tu lista`}
          score={comparison.pivot.score ?? null}
          onPress={() => {
            setAnswered((a) => a + 1)
            setState((s) => choose(s, false))
          }}
        />
      </View>
      {showCoach && (
        <RankCoachmark
          onDismiss={() => {
            markRankExplainerSeen()
            setShowCoach(false)
          }}
        />
      )}
    </View>
  )
}

// First-run explainer for the pairwise mechanic — the one non-self-evident step.
// Never blocks: tapping the scrim or the CTA both dismiss.
function RankCoachmark({ onDismiss }: { onDismiss: () => void }) {
  return (
    <AnimatedPressable
      entering={FadeIn.duration(180)}
      onPress={onDismiss}
      className="absolute inset-0 items-center justify-center bg-overlay-scrim px-6"
    >
      <Animated.View entering={FadeInDown.springify().damping(16)} className="w-full">
        <Card raised onStartShouldSetResponder={() => true} className="gap-2">
          <Eyebrow>Cómo funciona</Eyebrow>
          <Title>Sin estrellas. Solo comparas.</Title>
          <View className="my-1 flex-row gap-2">
            <Chip size="sm" state="selected">
              Este
            </Chip>
            <Chip size="sm">O este</Chip>
          </View>
          <Body>
            Te mostramos dos spots a la vez. Eliges el que estuvo mejor, unas cuantas veces, y con
            eso encontramos el orden exacto de tu lista — la puntuación sale de ahí.
          </Body>
          <Button variant="primary" onPress={onDismiss}>
            Entendido
          </Button>
        </Card>
      </Animated.View>
    </AnimatedPressable>
  )
}

// B1 — Find the place. Merged rows (ranked show their score, unranked "sin
// rankear"), filter chips, a "Quiero probar" lead group when browsing
// unfiltered, and an "add a new restaurant" footer.
function FindStep({
  candList,
  existing,
  wantToTryIds,
  query,
  setQuery,
  openNow,
  setOpenNow,
  reserveOnly,
  setReserveOnly,
  nearby,
  setNearby,
  myHood,
  onPick,
  addPlace,
  onGoogleCreated,
  onBack,
}: {
  candList: Item[]
  existing: Item[]
  wantToTryIds: string[]
  query: string
  setQuery: (v: string) => void
  openNow: boolean
  setOpenNow: Dispatch<SetStateAction<boolean>>
  reserveOnly: boolean
  setReserveOnly: Dispatch<SetStateAction<boolean>>
  nearby: boolean
  setNearby: Dispatch<SetStateAction<boolean>>
  myHood: string | null
  onPick: (id: string) => void
  addPlace: AddPlaceMutation
  onGoogleCreated: (restaurant: NewRestaurant) => void
  onBack: () => void
}) {
  const insets = useSafeAreaInsets()
  const placeholder = useColor('text-muted')
  const [adding, setAdding] = useState(false)
  const { position: myPosition, request: requestLocation } = useMyLocation()
  const q = query.trim().toLowerCase()
  // Hide "Abierto ahora" once the candidate list is catalog-heavy: it filters on
  // closesAt, which is null for every imported row, so it would wipe almost
  // everything. Keep it while active so it can be turned back off. (M7)
  const hoursCoverage = candList.length
    ? candList.filter((r) => r.closesAt).length / candList.length
    : 1
  const showOpenChip = openNow || hoursCoverage >= 0.4
  // candList already comes server-pre-filtered by q/openNow/reserveOnly; only
  // `existing` (my own list, always fetched in full) needs client filtering.
  const existingFiltered = existing.filter((r) => {
    if (openNow && !r.closesAt) return false
    if (reserveOnly && !r.phone) return false
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      (r.cuisine ?? '').toLowerCase().includes(q) ||
      (r.neighborhood ?? '').toLowerCase().includes(q)
    )
  })
  let filtered: Item[] = [...candList, ...existingFiltered]
  const distanceOf = (r: Item) =>
    myPosition && r.lat != null && r.lng != null
      ? haversineM(myPosition, { lat: r.lat, lng: r.lng })
      : null
  if (nearby && myPosition) {
    // Real distance, once we have one. Rows with no coordinates sort to the end
    // rather than being dropped — still real candidates, just unknown distance.
    filtered = [...filtered].sort((a, b) => {
      const da = distanceOf(a)
      const db = distanceOf(b)
      if (da == null && db == null) return a.name.localeCompare(b.name)
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
  } else if (nearby && myHood) {
    // No position yet (denied, or still in flight) — degrade to the self-declared
    // sector match rather than blocking the sort.
    filtered = [...filtered].sort((a, b) => {
      const am = a.neighborhood === myHood ? 0 : 1
      const bm = b.neighborhood === myHood ? 0 : 1
      return am - bm || a.name.localeCompare(b.name)
    })
  } else if (!q) {
    // No active search — alphabetical browse, mirroring the server's default.
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  }
  // else: keep candList's server-side relevance order.

  const leadGroup = q
    ? []
    : wantToTryIds
        .map((id) => filtered.find((r) => r.id === id))
        .filter((r): r is Item => Boolean(r))
  const leadIds = new Set(leadGroup.map((r) => r.id))
  const results = leadIds.size ? filtered.filter((r) => !leadIds.has(r.id)) : filtered

  // Google gap-filler — only when Mesa came up short. Deduped against results +
  // lead group so a spot you already have isn't re-offered; tapping continues
  // the rank flow with the new place. Shared with Explore (useExternalPlaceSearch).
  const {
    suggestions,
    create: createFromGoogle,
    creatingId,
  } = useExternalPlaceSearch({
    query,
    mesaResultCount: results.length + leadGroup.length,
    catalogNames: [...results.map((r) => r.name), ...leadGroup.map((r) => r.name)],
    onCreated: onGoogleCreated,
  })

  const renderRow = (r: Item) => {
    const dist = distanceOf(r)
    return (
      <Pressable
        key={r.id}
        accessibilityRole="button"
        onPress={() => onPick(r.id)}
        className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80"
      >
        <PlaceCover
          seed={r.id}
          name={r.name}
          coverImageId={r.coverImageId}
          size={{ w: 160, h: 160 }}
          className="h-14 w-14"
        />
        <View className="flex-1">
          <Text className="font-serif text-serif-md text-text" numberOfLines={1}>
            {r.name}
          </Text>
          <Characteristics
            priceTier={r.priceTier}
            cuisine={r.cuisine}
            neighborhood={r.neighborhood}
            hours={r.closesAt ? `hasta ${r.closesAt}` : null}
            distance={dist != null ? formatDistance(dist) : null}
          />
        </View>
        {r.score != null ? (
          <Text className="font-serif text-serif-lg text-accent">{displayScore(r.score)}</Text>
        ) : (
          <Text className="font-mono text-micro text-text-faint uppercase tracking-eyebrow">
            sin rankear
          </Text>
        )}
      </Pressable>
    )
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <View className="px-5">
        <BackBar label="✕ Rankear un spot" onBack={onBack} />
        <Title className="mt-4">Encuentra el spot</Title>
        <TextInput
          className="mt-4 min-h-[48px] rounded border border-line bg-surface px-4 font-ui text-body text-text"
          placeholderTextColor={placeholder}
          placeholder="Busca un spot donde hayas estado…"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
        <ChipRail className="mt-3">
          <Chip
            size="sm"
            state={nearby ? 'selected' : 'default'}
            onPress={() => {
              setNearby((v) => !v)
              requestLocation()
            }}
          >
            Cerca
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
          <Chip
            size="sm"
            state={reserveOnly ? 'selected' : 'default'}
            onPress={() => setReserveOnly((v) => !v)}
          >
            Reservar
          </Chip>
        </ChipRail>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pt-4 pb-10"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        {leadGroup.length === 0 && results.length === 0 && !q ? (
          <Body>Ya rankeaste todo en Mesa.</Body>
        ) : leadGroup.length === 0 && results.length === 0 ? (
          <Body>Nada coincide. Prueba con otro nombre.</Body>
        ) : (
          <>
            {leadGroup.length > 0 && (
              <>
                <Eyebrow className="font-mono">Quiero probar</Eyebrow>
                {leadGroup.map(renderRow)}
                <Eyebrow className="mt-3 font-mono">Todos</Eyebrow>
              </>
            )}
            {results.map(renderRow)}
          </>
        )}

        {!adding && (
          <ExternalResults
            heading={<Eyebrow className="mt-3 font-mono">En Google</Eyebrow>}
            suggestions={suggestions}
            creatingId={creatingId}
            onPick={createFromGoogle}
          />
        )}

        {adding ? (
          <AddPlaceForm addPlace={addPlace} onCancel={() => setAdding(false)} />
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            className="mt-4 min-h-[48px] items-center justify-center rounded border border-line border-dashed active:opacity-70"
          >
            <Text className="font-ui-medium text-label text-text-muted">
              + ¿No lo encuentras? Agrega un restaurante
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  )
}

// Minimal "add a place that isn't on Mesa" form (name + sector). The Google-
// found path (create-on-tap) lands with external search in N5.
function AddPlaceForm({
  addPlace,
  onCancel,
}: {
  addPlace: AddPlaceMutation
  onCancel: () => void
}) {
  const placeholder = useColor('text-muted')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () =>
      api.get<{ neighborhoods: { slug: string; name: string }[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const canAdd = name.trim().length > 0 && slug.length > 0 && !addPlace.isPending
  return (
    <View className="mt-4 gap-3 rounded border border-line bg-surface p-4">
      <TextInput
        className="min-h-[48px] rounded border border-line bg-bg px-4 font-ui text-body text-text"
        placeholderTextColor={placeholder}
        placeholder="Nombre del restaurante"
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <Text className="font-mono text-eyebrow text-text-muted uppercase tracking-eyebrow">
        Sector
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {neighborhoods.data?.neighborhoods.map((n) => (
          <Chip
            key={n.slug}
            size="sm"
            state={slug === n.slug ? 'selected' : 'default'}
            onPress={() => setSlug(n.slug)}
          >
            {n.name}
          </Chip>
        ))}
      </View>
      <View className="flex-row justify-end gap-3">
        <Button variant="secondary" className="w-auto min-h-[44px] px-4" onPress={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          className="w-auto min-h-[44px] px-5"
          disabled={!canAdd}
          onPress={() => addPlace.mutate({ name: name.trim(), neighborhoodSlug: slug })}
        >
          {addPlace.isPending ? 'Agregando…' : 'Agregar y rankear'}
        </Button>
      </View>
    </View>
  )
}
