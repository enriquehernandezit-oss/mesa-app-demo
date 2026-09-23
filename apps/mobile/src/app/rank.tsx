import {
  type UseMutationResult,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Link, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { DishNudgeCard } from '@/components/DishNudgeCard'
import { ExternalResults } from '@/components/ExternalResults'
import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  ChipRail,
  ErrorState,
  Eyebrow,
  RowsSkeleton,
  SerifItalic,
  Title,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { CompareCard } from '@/components/ui/CompareCard'
import { CheckIcon } from '@/components/ui/icons'
import { KeyboardDone } from '@/components/ui/KeyboardDone'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { showActionSheet } from '@/lib/actionSheet'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { mesaNorm } from '@/lib/dishCategories'
import { pickDishPhoto } from '@/lib/dishPhoto'
import {
  type Grain,
  OCCASION_TAGS,
  displayScore,
  grainOptions,
  ordinal,
  scoreForPosition,
  tagLabel,
} from '@/lib/display'
import { captureError } from '@/lib/errors'
import { formatDistance, haversineM } from '@/lib/geo'
import { tapSelect, tapSuccess } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { invalidateAfterRanking } from '@/lib/invalidateAfterRanking'
import { imageUrl } from '@/lib/media'
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
import { usePreventRemove } from '@/lib/preventRemove'
import { registerForPush } from '@/lib/push'
import { markRankExplainerSeen, rankExplainerSeen } from '@/lib/rankExplainer'
import { shareListCard } from '@/lib/shareCardStore'
import { profileShareText } from '@/lib/shareProfile'
import type {
  DishName,
  DishNudge,
  NewRestaurant,
  Ranking,
  RestaurantProfileResponse,
  SavedPlace,
} from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useExternalPlaceSearch } from '@/lib/useExternalPlaceSearch'
import { useMyLocation } from '@/lib/useMyLocation'
import { useColor } from '@/theme/useColor'
import { DATA_FIGURES } from '@/theme/vars'

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
  position?: number // present when it's already on your list
}

// A stable reference for the "no data yet" case — `data?.restaurants ?? []`
// would otherwise hand `candList` a fresh array every render, which defeats
// the `useMemo`s and effects that depend on it.
const EMPTY_ITEMS: Item[] = []

type AddPlaceMutation = UseMutationResult<
  { restaurant: NewRestaurant },
  Error,
  { name: string; neighborhoodSlug: string }
>

// A dish chosen (or freshly typed) on the reveal's "¿Qué pediste?" step.
// `isNew` is only telemetry — the server upserts by (rankingId, nameKey)
// either way, so a mis-typed name that happens to match an existing one just
// joins it. No categoryId: as of M13 the rank flow never asks for one, the
// server infers it via guessDishCategory. `dishId` is filled in once the
// dish's own POST resolves — used only to target a later DELETE.
type SelectedDish = {
  name: string
  nameKey: string
  sentiment: Sentiment | null
  isNew: boolean
  dishId?: string
}

type RankStage = 'sentiment' | 'placed' | 'revealed'
const STAGE_ORDER: Record<RankStage, number> = { sentiment: 1, placed: 2, revealed: 3 }

type Top5Item = { position: number; name: string; score: number; coverImageId?: string | null }

// The updated top 5, computed purely from local flow state (never from the
// `mine` query) — a background refetch from `invalidateAfterRanking` may not
// have landed by the time the celebration stamp shows, and this is the exact
// moment the "Compartir mi top 5" button appears. Mirrors RevealStep's `around`
// loop, generalized from ±1 neighbor to the whole ordered list.
function buildTop5(existingForCompare: Item[], picked: Item, position: number): Top5Item[] {
  // Sorted by the server's own position, not the rounded display score — with
  // >=25 places the linear score formula gives adjacent positions the same
  // integer, so sorting by score could show two places swapped.
  const orderedByPos = [...existingForCompare].sort(
    (a, b) => (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY),
  )
  const total = orderedByPos.length + 1
  const full: Top5Item[] = []
  for (let pos = 1; pos <= total; pos++) {
    if (pos === position) {
      full.push({
        position: pos,
        name: picked.name,
        score: scoreForPosition(pos - 1, total),
        coverImageId: picked.coverImageId,
      })
    } else {
      const r = orderedByPos[pos < position ? pos - 1 : pos - 2]
      if (r) {
        full.push({
          position: pos,
          name: r.name,
          score: scoreForPosition(pos - 1, total),
          coverImageId: r.coverImageId,
        })
      }
    }
  }
  return full.slice(0, 5)
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export default function RankAPlace() {
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ restaurant?: string }>()
  const t = useT()

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
  const [nearby, setNearby] = useState(false)
  const me = useProfile(true, 300_000)
  const myHood = me.data?.profile.neighborhood?.name ?? null

  // Query-driven, mirroring Explore: the server searches (mesa_norm + trigram)
  // and bounds the result. Debounced, and the previous results stay on screen
  // while the next ones load — a fresh key per keystroke used to go "pending"
  // and swap the whole step (search field included) for a skeleton, closing
  // the keyboard on every letter.
  const searchQ = useDebounced(pickQuery.trim(), 250)
  const candidates = useQuery({
    queryKey: ['rankings', 'candidates', searchQ, openNow],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const p = new URLSearchParams()
      if (searchQ.length >= 2) p.set('q', searchQ)
      if (openNow) p.set('open', '1')
      return api.get<{ restaurants: Item[] }>(`/rankings/candidates?${p}`)
    },
  })

  const [sentiment, setSentiment] = useState<Sentiment | null>(null)
  const [position, setPosition] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [selectedDishes, setSelectedDishes] = useState<SelectedDish[]>([])
  // Merged into this screen (was a separate composer chained after saving):
  // the photo, if any, is attached and posted as a dish in the same "Guardar
  // nota" tap. dishGrain only matters once a photo exists; 'candlelit' matches
  // the standalone composer's own default treatment.
  const [dishImage, setDishImage] = useState<string | null>(null)
  const [dishGrain, setDishGrain] = useState<Grain>('candlelit')
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
        position: r.position,
      })),
    [mine.data],
  )
  const candList = candidates.data?.restaurants ?? EMPTY_ITEMS
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
  // `retry: 2` plus a real onError (previously none — a failed POST after a
  // swipe-down away from the reveal used to fail completely silently, with no
  // toast, no retry, and no sign anything was wrong) covers a flaky connection
  // without the member ever finding out their ranking didn't actually save.
  const commitInitial = useMutation({
    mutationFn: (pos: number) => api.post('/rankings', { restaurantId: pickedId, position: pos }),
    retry: 2,
    onSuccess: () => {
      track('rank_placed', { rerank: isRerank, listSize: existingForCompare.length })
      invalidateAfterRanking(pickedId)
      // Contextual push-permission prompt (M17) — a member who just placed a
      // ranking has demonstrated real intent, unlike a cold-launch prompt.
      // No-op if already decided (granted just re-registers the token,
      // cheap; denied does nothing).
      void registerForPush()
    },
    onError: (err) => {
      captureError(err, 'rank.commit')
    },
  })
  const committedForId = useRef<string | null>(null)
  // Snapshot of `picked` at the exact moment a position first commits for this
  // pick — RevealStep/NoteStep/the placed-stamp below read THIS instead of
  // the live `picked` memo. `invalidateAfterRanking` (in commitInitial's own
  // onSuccess) also invalidates the candidates query, which excludes already-
  // ranked places; if that refetch lands before `mine` catches up, live
  // `picked` can transiently go null and the render would otherwise fall
  // through to the very top FindStep gate, flashing the search screen back
  // over an in-progress reveal.
  const pickedRef = useRef<Item | null>(null)
  // oxlint-disable react/exhaustive-deps -- commitInitial.mutate is TanStack
  // Query's stable function reference; the wrapping mutation OBJECT is a new
  // one every time isPending/isError changes, so depending on the whole
  // object would re-fire this mid-mutation and could double-submit.
  useEffect(() => {
    if (pickedId && position !== null && committedForId.current !== pickedId) {
      committedForId.current = pickedId
      pickedRef.current = picked
      commitInitial.mutate(position)
    }
  }, [pickedId, position, picked, commitInitial.mutate])
  // oxlint-enable react/exhaustive-deps
  const committedPlace = pickedRef.current

  // The friend signal for the reveal screen — the same profile data the
  // restaurant page shows, fetched once the score is on screen.
  const friendsQuery = useQuery({
    queryKey: ['restaurant', pickedId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${pickedId}`),
    enabled: Boolean(pickedId) && position !== null,
    staleTime: 30_000,
  })
  // Fetched the moment the score reveals, so the "¿Qué pediste?" chips are
  // already there — no spinner between the reveal and the chip row.
  const dishNamesQuery = useQuery({
    queryKey: ['dish-names', pickedId],
    queryFn: () => api.get<{ names: DishName[] }>(`/dishes/restaurant/${pickedId}/names`),
    enabled: Boolean(pickedId) && position !== null,
    staleTime: 60_000,
  })

  // Held so a swipe-back (or the modal's own beforeRemove-driven dismiss)
  // during the 1.3s stamp can cancel the pending state change — acting on a
  // screen that already unmounted is exactly what produces the "screen 'rank'
  // was removed natively but didn't get removed from JS state" warning. It used
  // to gate a `router.replace('/rankings')`; now it gates revealing the two
  // finish actions below instead — same guard, later timer target.
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (finishTimer.current) clearTimeout(finishTimer.current)
    }
  }, [])

  const [showFinishActions, setShowFinishActions] = useState(false)
  const finishToRankings = () => {
    setPlacedStamp(true)
    tapSuccess()
    finishTimer.current = setTimeout(() => setShowFinishActions(true), 1300)
  }

  // "Saved as you tap" (M13): each dish add, sentiment change, or photo
  // attach on the reveal's "¿Qué pediste?" step POSTs immediately — there's
  // no longer a batch post at "Guardar nota" time. `dishQueueRef` serializes
  // those calls (a ref-based promise chain) so a fast run of taps can't race
  // each other; `dishIdByKey` remembers each dish's server-assigned id (by
  // nameKey) purely for a later DELETE to target the right row, resolved
  // lazily since the DELETE can be enqueued before its own POST resolves —
  // the queue's FIFO order guarantees the POST's ref write always lands
  // first. `dishSyncPending` (count > 0) gates "Listo" and "Agregar una
  // nota", which must not proceed while the queue is still draining.
  const dishQueueRef = useRef<Promise<void>>(Promise.resolve())
  const dishIdByKey = useRef<Map<string, string>>(new Map())
  const dishSyncCountRef = useRef(0)
  const [dishSyncPending, setDishSyncPending] = useState(false)
  // M20 — each dish POST also returns how many distinct restaurants I've now
  // posted this nameKey at (dishCounts, for the "tu 2ª carbonara" chip
  // caption) and, on the one call that crosses a threshold, a nudge to go
  // rank them. Dismissing the card only hides it for the rest of THIS
  // session — the list itself lives on in Profile's "Tus platos" regardless.
  const [dishCounts, setDishCounts] = useState<Map<string, number>>(new Map())
  const [dishNudge, setDishNudge] = useState<DishNudge | null>(null)
  // Synchronous re-entrancy guard for addDish/removeDish (responsiveness
  // audit) — both handlers derive their decision from `selectedDishes`,
  // which is React state, so two taps landing before the next render both
  // see the SAME stale array: addDish's `.some()` duplicate check couldn't
  // tell the second tap the first one already happened. Two fast taps on
  // the same suggested-dish chip used to add TWO entries with a colliding
  // React key (`{d.nameKey}`) and fire two POST /dishes calls for the same
  // dish. Keyed on nameKey, cleared once that dish's own queued operation
  // settles — this only blocks a genuine double-tap on the SAME dish;
  // acting on a different dish, or toggling sentiment on one already
  // settled, is unaffected.
  const pendingDishActionRef = useRef<Set<string>>(new Set())

  function enqueueDish(fn: () => Promise<void>) {
    dishSyncCountRef.current++
    setDishSyncPending(true)
    const run = async () => {
      try {
        await fn()
      } catch (err) {
        captureError(err, 'rank.dish_sync')
        toast({ variant: 'error', message: t('rank.dish_sync_error') })
      } finally {
        dishSyncCountRef.current--
        if (dishSyncCountRef.current === 0) setDishSyncPending(false)
      }
    }
    dishQueueRef.current = dishQueueRef.current.then(run, run)
    return dishQueueRef.current
  }

  async function postDish(
    dish: SelectedDish,
    opts: { isFirst: boolean; image?: string; grain?: Grain; removeImage?: boolean },
  ) {
    const res = await api.post<{ id: string; myCount: number; nudge: DishNudge | null }>(
      '/dishes',
      {
        restaurantId: pickedId,
        name: dish.name,
        sentiment: dish.sentiment ?? undefined,
        visibility: 'friends',
        alsoFavorite: opts.isFirst,
        ...(opts.image ? { image: opts.image, grain: opts.grain } : {}),
        ...(opts.removeImage ? { removeImage: true } : {}),
      },
    )
    dishIdByKey.current.set(dish.nameKey, res.id)
    setSelectedDishes((cur) =>
      cur.map((d) => (d.nameKey === dish.nameKey ? { ...d, dishId: res.id } : d)),
    )
    setDishCounts((cur) => new Map(cur).set(dish.nameKey, res.myCount))
    if (res.nudge) setDishNudge(res.nudge)
    queryClient.invalidateQueries({ queryKey: ['dish-names', pickedId] })
    // The restaurant profile's "Popular dishes" rail (['dishes', id]) reads
    // this same table — without this, a dish (or photo) posted here never
    // shows up there until something else happens to invalidate that key.
    queryClient.invalidateQueries({ queryKey: ['dishes', pickedId] })
  }

  async function deleteDish(nameKey: string) {
    const id = dishIdByKey.current.get(nameKey)
    dishIdByKey.current.delete(nameKey)
    if (id) {
      await api.del(`/dishes/${id}`)
      queryClient.invalidateQueries({ queryKey: ['dish-names', pickedId] })
      queryClient.invalidateQueries({ queryKey: ['dishes', pickedId] })
    }
  }

  function addDish(candidate: SelectedDish) {
    if (pendingDishActionRef.current.has(candidate.nameKey)) return
    if (selectedDishes.some((d) => d.nameKey === candidate.nameKey)) return
    if (selectedDishes.length >= 3) {
      toast({ message: t('rank.dish_max') })
      return
    }
    pendingDishActionRef.current.add(candidate.nameKey)
    const isFirst = selectedDishes.length === 0
    setSelectedDishes((cur) => [...cur, candidate])
    enqueueDish(() => postDish(candidate, { isFirst })).finally(() => {
      pendingDishActionRef.current.delete(candidate.nameKey)
    })
  }

  // Removing the favorite (index 0) dish re-syncs the new first dish (if any)
  // so `rankings.favoriteDish` points at something live — DELETE already
  // clears it server-side when it matches the removed dish's name, but only
  // this re-post picks a new one. The deleted dish's own photo doesn't carry
  // over: it belonged to that row, which is now gone.
  function removeDish(nameKey: string) {
    if (pendingDishActionRef.current.has(nameKey)) return
    const wasFirst = selectedDishes[0]?.nameKey === nameKey
    const newFirst = selectedDishes.find((d) => d.nameKey !== nameKey)
    pendingDishActionRef.current.add(nameKey)
    setSelectedDishes((cur) => cur.filter((d) => d.nameKey !== nameKey))
    if (wasFirst) setDishImage(null)
    enqueueDish(() => deleteDish(nameKey)).finally(() => {
      pendingDishActionRef.current.delete(nameKey)
    })
    if (wasFirst && newFirst) enqueueDish(() => postDish(newFirst, { isFirst: true }))
  }

  function toggleDishSentiment(nameKey: string, sentiment: Sentiment) {
    const target = selectedDishes.find((d) => d.nameKey === nameKey)
    if (!target) return
    const updated: SelectedDish = {
      ...target,
      sentiment: target.sentiment === sentiment ? null : sentiment,
    }
    setSelectedDishes((cur) => cur.map((d) => (d.nameKey === nameKey ? updated : d)))
    const isFirst = selectedDishes[0]?.nameKey === nameKey
    enqueueDish(() => postDish(updated, { isFirst }))
  }

  async function attachDishPhoto() {
    const uri = await pickDishPhoto()
    if (!uri || !selectedDishes[0]) return
    setDishImage(uri)
    enqueueDish(() => postDish(selectedDishes[0], { isFirst: true, image: uri, grain: dishGrain }))
  }

  function removeDishPhoto() {
    setDishImage(null)
    if (selectedDishes[0]) {
      enqueueDish(() => postDish(selectedDishes[0], { isFirst: true, removeImage: true }))
    }
  }

  function setDishGrainAndSync(g: Grain) {
    setDishGrain(g)
    if (dishImage && selectedDishes[0]) {
      enqueueDish(() => postDish(selectedDishes[0], { isFirst: true, image: dishImage, grain: g }))
    }
  }

  // Only the note + occasion tags post here now — every selected dish is
  // already persisted by the time this fires (see the queue above). The
  // initial commitInitial POST already exists by the time this fires (it
  // runs the moment the score reveals), so /dishes' "rank it first" check
  // was always satisfied for every dish POST too.
  const save = useMutation({
    mutationFn: (pos: number) =>
      api.post('/rankings', {
        restaurantId: pickedId,
        position: pos,
        vibeNote: note.trim() || undefined,
        tags: tags.length ? tags : undefined,
      }),
    onSuccess: () => {
      track('rank_saved', {
        hasNote: note.trim().length > 0,
        tags: tags.length,
        dishCount: selectedDishes.length,
        newDishCount: selectedDishes.filter((d) => d.isNew).length,
        sentimentCount: selectedDishes.filter((d) => d.sentiment !== null).length,
        hasPhoto: Boolean(dishImage),
      })
      invalidateAfterRanking(pickedId)
      finishToRankings()
    },
    onError: (err, pos) => {
      captureError(err, 'rank.save')
      toast({
        variant: 'error',
        message: t('rank.save_error'),
        action: { label: t('common.retry'), onClick: () => save.mutate(pos) },
      })
    },
  })

  const deepLinked = Boolean(params.restaurant || addedPlace)

  // Guard swipe-down-to-dismiss (and the modal's hardware-back on Android)
  // against silently losing real effort. Picking a place or a sentiment costs
  // nothing to redo, so those never prompt; once pairwise placement has
  // started, several taps are on the line. Once the score is revealed AND
  // committed, only a note/tags edit can still be lost — a selected dish or
  // its photo is not in this list any more, since M13 posts those the
  // instant they're picked, not at "Guardar nota" (swiping away can't lose
  // them). While the commit is still pending or has failed, the ranking
  // itself is still on the line too, so that state prompts on its own even
  // with nothing typed yet (this is the fix for a swipe-down silently
  // discarding the score the member was just given).
  const dirty =
    !placedStamp &&
    ((sentiment !== null && position === null) ||
      (position !== null && !revealed && (commitInitial.isPending || commitInitial.isError)) ||
      (revealed && (note.trim() !== '' || tags.length > 0)))
  usePreventRemove(dirty, ({ data }) => {
    showActionSheet({
      title: revealed ? t('rank.discard_note_title') : t('rank.discard_title'),
      message: revealed ? t('rank.discard_note_message') : undefined,
      options: [{ label: t('rank.discard_button'), destructive: true }],
    }).then((i) => {
      if (i === 0) navigation.dispatch(data.action)
    })
  })

  // The furthest stage reached, ratcheted forward only — never downgraded by
  // the in-app "Atrás" handlers (RevealStep/NoteStep's onBack) unwinding a
  // state back to null as the member steps backward. Read only from the
  // unmount effect below.
  const stageRef = useRef<RankStage | null>(null)
  useEffect(() => {
    const current: RankStage | null = revealed
      ? 'revealed'
      : position !== null
        ? 'placed'
        : sentiment
          ? 'sentiment'
          : null
    if (current && (!stageRef.current || STAGE_ORDER[current] > STAGE_ORDER[stageRef.current])) {
      stageRef.current = current
    }
  }, [sentiment, position, revealed])
  const placedStampRef = useRef(placedStamp)
  placedStampRef.current = placedStamp
  const positionRef = useRef<number | null>(null)
  positionRef.current = position
  const commitSucceededRef = useRef(false)
  commitSucceededRef.current = commitInitial.isSuccess

  // Fires once, on the screen's REAL exit — any path (back gesture, swipe,
  // switching tabs mid-flow), not just the in-app "Atrás" controls. An
  // earlier implementation only tracked one narrow deep-link sub-case, and
  // even then always reported stage: 'sentiment' regardless of how far the
  // flow had actually gotten. Skipped when the flow actually finished
  // (placedStamp true): that's a completion, not a drop-off — the "drop-off
  // we most need to see" this metric exists for.
  // oxlint-disable react/exhaustive-deps -- one-shot unmount cleanup by design (see above); t is stable enough (only changes on a language toggle) not to need retriggering this.
  useEffect(() => {
    return () => {
      if (stageRef.current && !placedStampRef.current) {
        track('rank_abandoned', { stage: stageRef.current })
        // Swiped away (or backed out) after the score committed, but without
        // ever tapping "Listo" or "Guardar nota" — the ranking is real and on
        // the list either way, so say so. `<Toaster/>` can't render above a
        // still-presented native modal (rank IS one), but this fires from the
        // unmount cleanup, i.e. as the modal is already going away, so it
        // lands the moment the sheet is actually gone — same mechanism as any
        // other post-dismissal toast in this app.
        if (positionRef.current !== null && commitSucceededRef.current && pickedRef.current) {
          toast({
            message: t('rank.saved_without_stamp', {
              name: pickedRef.current.name,
              position: positionRef.current,
            }),
          })
        }
      }
    }
  }, [])
  // oxlint-enable react/exhaustive-deps

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
        message: capped ? t('rank.add_place_capped') : t('rank.add_place_error'),
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

  // The celebration stamp — "#3 · Mijas" punches in over the screen. Once
  // finishTimer's 1.3s pause is up, two actions fade in: this is the highest-
  // intent moment in the whole app, and it used to have no share affordance at
  // all before silently auto-navigating away.
  if (placedStamp && committedPlace && position !== null) {
    const firstName = (me.data?.profile.name ?? '').split(' ')[0] || 'Mi'
    const shareTop5 = () => {
      const items = buildTop5(existingForCompare, committedPlace, position)
      shareListCard({
        eyebrow: `${firstName} · top ${Math.min(items.length, 5)}`,
        subtitle: [me.data?.profile.neighborhood?.name, 'Santo Domingo']
          .filter(Boolean)
          .join(' · '),
        items: items.map((it) => ({ position: it.position, name: it.name, score: it.score })),
        coverUrl: imageUrl(items[0]?.coverImageId, { w: 1080, h: 780 }),
        text: profileShareText(me.data?.profile.handle),
      })
    }
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-bg px-5">
        {/* The stamp punches in — it already fires tapSuccess, and a celebration
            that appears instantly reads as a screen change, not an event. */}
        <Animated.View
          entering={ZoomIn.springify().damping(12)}
          className="h-28 w-28 items-center justify-center rounded-pill border-2 border-accent"
        >
          <Text style={DATA_FIGURES} className="font-serif text-display text-accent">
            #{position}
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150)} className="items-center gap-3">
          <Text className="font-serif text-serif-lg text-text">{committedPlace.name}</Text>
          <Caption>{t('rank.added_to_passport')}</Caption>
        </Animated.View>
        {/* "Listo" is the only action that leaves — sharing doesn't navigate
            away on its own, so tapping it and coming back still shows this
            screen (and the share sheet can be reopened). */}
        {showFinishActions && (
          <Animated.View entering={FadeIn} className="mt-4 w-full gap-3">
            <Button variant="primary" onPress={shareTop5}>
              {t('rank.share_top5')}
            </Button>
            <Button variant="ghost" onPress={() => router.replace('/rankings')}>
              {t('common.done')}
            </Button>
          </Animated.View>
        )}
      </View>
    )
  }

  if (candidates.isPending || mine.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <RowsSkeleton rows={5} thumb={56} className="px-5" />
      </View>
    )
  }
  if (candidates.isError || mine.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-5">
        <ErrorState
          onRetry={() => {
            candidates.refetch()
            mine.refetch()
          }}
        >
          {t('rank.list_load_error')}
        </ErrorState>
      </View>
    )
  }

  // B1 — Find the place. Only while nothing has committed yet — once a
  // position exists, `picked` (live) transiently going null must NOT fall
  // through to here (see committedPlace's comment above); the branches below
  // read committedPlace instead, which stays set for the rest of the flow.
  if (!picked && position === null) {
    return (
      <FindStep
        candList={candList}
        existing={existing}
        wantToTryIds={wantToTryIds}
        query={pickQuery}
        setQuery={setPickQuery}
        openNow={openNow}
        setOpenNow={setOpenNow}
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

  // B3 — the score reveal, including "¿Qué pediste?" (M13).
  if (position !== null && !revealed && committedPlace) {
    return (
      <RevealStep
        picked={committedPlace}
        position={position}
        existingForCompare={existingForCompare}
        friendsPending={friendsQuery.isPending}
        friendsRankings={friendsQuery.data?.friendsRankings ?? []}
        friendAvg={friendsQuery.data?.friendAvg ?? 0}
        commitPending={commitInitial.isPending}
        commitError={commitInitial.isError}
        onRetryCommit={() => commitInitial.mutate(position)}
        selectedDishes={selectedDishes}
        dishCounts={dishCounts}
        dishNudge={dishNudge}
        onDismissNudge={() => setDishNudge(null)}
        dishNames={dishNamesQuery.data?.names ?? []}
        dishNamesError={dishNamesQuery.isError}
        dishImage={dishImage}
        dishGrain={dishGrain}
        onAddDish={addDish}
        onRemoveDish={removeDish}
        onToggleSentiment={toggleDishSentiment}
        onAttachPhoto={attachDishPhoto}
        onRemovePhoto={removeDishPhoto}
        onSetGrain={setDishGrainAndSync}
        dishSyncPending={dishSyncPending}
        onBack={() => {
          committedForId.current = null
          setPosition(null)
        }}
        onDone={async () => {
          await dishQueueRef.current
          finishToRankings()
        }}
        onAddNote={async () => {
          await dishQueueRef.current
          setRevealed(true)
        }}
      />
    )
  }

  // B4 — note + occasion tags. Every dish was already saved on the reveal.
  if (position !== null && committedPlace) {
    return (
      <NoteStep
        picked={committedPlace}
        position={position}
        existingCount={existingForCompare.length}
        note={note}
        setNote={setNote}
        tags={tags}
        setTags={setTags}
        saving={save.isPending}
        onBack={() => setRevealed(false)}
        onSave={() => save.mutate(position)}
      />
    )
  }

  // Every branch above that needs `position !== null` already returned, so
  // `picked` being null here can only mean the very first FindStep gate above
  // would already have returned too — this is just re-establishing that for
  // the type checker, not a real runtime path.
  if (!picked) return null

  // Sentiment — how did it feel? Narrows the comparison band.
  if (!sentiment) {
    return (
      <StepScreen>
        <BackBar
          label={t('common.back')}
          onBack={() => {
            if (deepLinked) router.replace('/rankings')
            else setPickedId(null)
          }}
        />
        <View className="mt-4 items-center gap-1">
          <Eyebrow>{picked.name}</Eyebrow>
          <Title>{t('rank.sentiment_title')}</Title>
        </View>
        <View className="mt-6 gap-3">
          <SentimentButton
            tone="loved"
            onPress={() => {
              tapSelect()
              track('rank_started', { sentiment: 'loved', rerank: isRerank })
              setSentiment('loved')
            }}
          >
            {t('rank.sentiment_loved')}
          </SentimentButton>
          <SentimentButton
            tone="fine"
            onPress={() => {
              tapSelect()
              track('rank_started', { sentiment: 'fine', rerank: isRerank })
              setSentiment('fine')
            }}
          >
            {t('rank.sentiment_fine')}
          </SentimentButton>
          <SentimentButton
            tone="low"
            onPress={() => {
              tapSelect()
              track('rank_started', { sentiment: 'disliked', rerank: isRerank })
              setSentiment('disliked')
            }}
          >
            {t('rank.sentiment_disliked')}
          </SentimentButton>
        </View>
      </StepScreen>
    )
  }

  // B2 — pairwise placement, banded by sentiment.
  return (
    <StepScreen>
      <BackBar label={t('common.back')} onBack={() => setSentiment(null)} />
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
}: {
  tone: 'loved' | 'fine' | 'low'
  children: React.ReactNode
  onPress: () => void
}) {
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

// B3 — the score reveal, plus "¿Qué pediste?" (M13): where the spot landed
// (its neighbours + the friend signal), then which dishes were ordered. The
// parent already committed the ranking; every dish tap here posts on its own
// through the parent's serial queue — nothing on this screen is batched.
function RevealStep({
  picked,
  position,
  existingForCompare,
  friendsPending,
  friendsRankings,
  friendAvg,
  commitPending,
  commitError,
  onRetryCommit,
  selectedDishes,
  dishCounts,
  dishNudge,
  onDismissNudge,
  dishNames,
  dishNamesError,
  dishImage,
  dishGrain,
  onAddDish,
  onRemoveDish,
  onToggleSentiment,
  onAttachPhoto,
  onRemovePhoto,
  onSetGrain,
  dishSyncPending,
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
  commitPending: boolean
  commitError: boolean
  onRetryCommit: () => void
  selectedDishes: SelectedDish[]
  dishCounts: Map<string, number>
  dishNudge: DishNudge | null
  onDismissNudge: () => void
  dishNames: DishName[]
  dishNamesError: boolean
  dishImage: string | null
  dishGrain: Grain
  onAddDish: (dish: SelectedDish) => void
  onRemoveDish: (nameKey: string) => void
  onToggleSentiment: (nameKey: string, sentiment: Sentiment) => void
  onAttachPhoto: () => void
  onRemovePhoto: () => void
  onSetGrain: (g: Grain) => void
  dishSyncPending: boolean
  onBack: () => void
  onDone: () => void
  onAddNote: () => void
}) {
  const insets = useSafeAreaInsets()
  const placeholder = useColor('text-muted')
  const t = useT()
  const [dishQuery, setDishQuery] = useState('')
  const debouncedDishQuery = useDebounced(dishQuery, 150)
  // Sorted by position, not rounded score — see buildTop5's comment above.
  const orderedByPos = [...existingForCompare].sort(
    (a, b) => (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY),
  )
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

  const selectedKeys = new Set(selectedDishes.map((d) => d.nameKey))
  const needle = mesaNorm(debouncedDishQuery.trim())
  const visibleNames = (
    needle ? dishNames.filter((n) => mesaNorm(n.label).includes(needle)) : dishNames
  )
    .filter((n) => !selectedKeys.has(n.nameKey))
    .slice(0, 6)
  const exactExists = dishNames.some((n) => n.nameKey === needle) || selectedKeys.has(needle)
  const showAddChip = debouncedDishQuery.trim().length >= 2 && !exactExists
  function addNewDishFromQuery() {
    const trimmed = dishQuery.trim()
    if (!trimmed) return
    onAddDish({ name: trimmed, nameKey: mesaNorm(trimmed), sentiment: null, isNew: true })
    setDishQuery('')
  }

  // A tap on "Listo" while the ranking/dishes are still saving is remembered,
  // not ignored — it finishes the moment the save lands (it used to be
  // disabled, so a quick tap right after the reveal simply did nothing).
  // Only a failed commit truly blocks it.
  const saving = commitPending || dishSyncPending
  const listoBlocked = commitError
  const [wantsDone, setWantsDone] = useState(false)
  const finish = () => {
    if (commitError) return
    if (saving) setWantsDone(true)
    else onDone()
  }
  useEffect(() => {
    if (wantsDone && !saving && !commitError) {
      setWantsDone(false)
      onDone()
    }
  }, [wantsDone, saving, commitError, onDone])
  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <View className="flex-row items-center justify-between">
        <BackBar label={t('common.back')} onBack={onBack} />
        {/* Disabled while the commit hasn't settled, or the dish queue is
            still draining — tapping "Listo" here used to jump straight to
            the celebration stamp regardless of whether the ranking (and now,
            every selected dish) had actually saved, so a fast tap right
            after the reveal (or a slow connection) could show "#3 · Mijas"
            for a ranking that then silently failed to persist. */}
        <Pressable
          accessibilityRole="button"
          onPress={finish}
          disabled={listoBlocked}
          className={`min-h-[44px] justify-center active:opacity-60 ${listoBlocked ? 'opacity-40' : ''}`}
        >
          <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
            {saving ? t('common.saving') : t('common.done')}
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
          <Eyebrow>{t('rank.your_score')}</Eyebrow>
          <Text style={DATA_FIGURES} className="font-serif text-display text-accent">
            {displayScore(score)}
          </Text>
          <Title className="mt-1">{picked.name}</Title>
          <Characteristics
            priceTier={picked.priceTier}
            cuisine={picked.cuisine}
            neighborhood={picked.neighborhood}
          />
          <Chip size="sm" state="selected" className="mt-3">
            {t('rank.position_of_total', { position, total })}
          </Chip>
        </View>

        <View className="mt-6 gap-1">
          {around.map((n) => (
            <View
              key={n.pos}
              className={`flex-row items-center gap-3 rounded px-3 py-2 ${n.isNew ? 'border border-accent bg-surface' : ''}`}
            >
              <Text style={DATA_FIGURES} className="w-6 font-serif text-serif-md text-text-muted">
                {n.pos}
              </Text>
              <Text className="flex-1 font-serif text-serif-md text-text" numberOfLines={1}>
                {n.name}
              </Text>
              <ScoreBadge size="sm" score={n.score} attribution={{ kind: 'stated' }} />
            </View>
          ))}
        </View>

        {/* M13: dish-logging lives here now, not gated behind the note step —
            no category caption, picker, or auto-expand anywhere in this
            block, since the server infers it (guessDishCategory). Every tap
            below posts on its own through the parent's queue. */}
        <Eyebrow className="mt-6">{t('rank.what_did_you_order')}</Eyebrow>
        <Caption className="mt-1">{t('rank.what_did_you_order_helper')}</Caption>
        <View className="mt-2 min-h-[48px] rounded border border-line bg-surface px-4 justify-center">
          <TextInput
            className="font-ui text-body text-text"
            placeholderTextColor={placeholder}
            placeholder={t('rank.dish_search_placeholder')}
            maxLength={60}
            returnKeyType="search"
            value={dishQuery}
            onChangeText={setDishQuery}
            onSubmitEditing={addNewDishFromQuery}
          />
        </View>
        {dishNamesError && (
          <Caption className="mt-1 text-status-packed">{t('rank.dish_names_error')}</Caption>
        )}

        <View className="mt-3 flex-row flex-wrap gap-2">
          {selectedDishes.map((d) => {
            // M20 — once you've had this exact dish somewhere before, the
            // chip says which time this is ("tu 2ª carbonara"). Never shown
            // for the very first ("tu 1ª" would just be noise).
            const count = dishCounts.get(d.nameKey)
            return (
              <Chip
                key={d.nameKey}
                size="sm"
                state="selected"
                hitSlop={4}
                onPress={() => {
                  tapSelect()
                  onRemoveDish(d.nameKey)
                }}
              >
                {count != null && count >= 2
                  ? t('rank.dish_repeat_chip', { name: d.name, ordinal: ordinal(count) })
                  : d.name}
              </Chip>
            )
          })}
          {visibleNames.map((n) => (
            <Chip
              key={n.nameKey}
              size="sm"
              hitSlop={4}
              onPress={() => {
                tapSelect()
                onAddDish({
                  name: n.label,
                  nameKey: n.nameKey,
                  sentiment: null,
                  isNew: false,
                })
              }}
            >
              {n.label} · {n.count}
            </Chip>
          ))}
          {showAddChip && (
            <Chip
              size="sm"
              state="active"
              hitSlop={4}
              onPress={() => {
                tapSelect()
                addNewDishFromQuery()
              }}
            >
              {t('rank.add_dish_named', { name: dishQuery.trim() })}
            </Chip>
          )}
        </View>

        {selectedDishes.map((d, i) => (
          <View key={d.nameKey} className="mt-3 gap-2 rounded border border-line bg-surface p-3">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 font-serif text-serif-sm text-text" numberOfLines={1}>
                {d.name}
              </Text>
              {/* Every tap here saves on its own (the parent's queue) — this
                  says so, instead of leaving "did that stick?" to guesswork. */}
              {d.dishId ? (
                <View className="flex-row items-center gap-1">
                  <CheckIcon size={13} color="accent" />
                  <Caption className="font-ui-semibold text-micro text-accent-strong">
                    {t('rank.dish_saved')}
                  </Caption>
                </View>
              ) : (
                <Caption className="text-micro">{t('common.saving')}</Caption>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  tapSelect()
                  onRemoveDish(d.nameKey)
                }}
                className="h-8 w-8 items-center justify-center active:opacity-60"
              >
                <Text className="font-ui text-eyebrow text-text-muted">✕</Text>
              </Pressable>
            </View>
            <View className="flex-row gap-2">
              <Chip
                size="sm"
                state={d.sentiment === 'loved' ? 'selected' : 'default'}
                onPress={() => {
                  tapSelect()
                  onToggleSentiment(d.nameKey, 'loved')
                }}
              >
                {t('rank.sentiment_loved')}
              </Chip>
              <Chip
                size="sm"
                state={d.sentiment === 'fine' ? 'selected' : 'default'}
                onPress={() => {
                  tapSelect()
                  onToggleSentiment(d.nameKey, 'fine')
                }}
              >
                {t('rank.sentiment_fine')}
              </Chip>
              <Chip
                size="sm"
                state={d.sentiment === 'disliked' ? 'selected' : 'default'}
                onPress={() => {
                  tapSelect()
                  onToggleSentiment(d.nameKey, 'disliked')
                }}
              >
                {t('rank.sentiment_disliked')}
              </Chip>
            </View>
            {/* The photo affordance only ever shows on the first selected
                dish — one dish photo per rank, same as before M13. */}
            {i === 0 &&
              (dishImage ? (
                <>
                  <View className="h-40 w-full overflow-hidden rounded border border-line">
                    <Image
                      source={{ uri: dishImage }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('rank.remove_photo')}
                      onPress={onRemovePhoto}
                      className="absolute top-2 right-2 h-8 w-8 items-center justify-center rounded-pill bg-surface active:opacity-70"
                    >
                      <Text className="font-ui text-eyebrow text-text-muted">✕</Text>
                    </Pressable>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {grainOptions().map((g) => (
                      <Chip
                        key={g.value}
                        size="sm"
                        state={dishGrain === g.value ? 'selected' : 'default'}
                        onPress={() => onSetGrain(g.value)}
                      >
                        {g.label}
                      </Chip>
                    ))}
                  </View>
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={onAttachPhoto}
                  className="min-h-[56px] flex-row items-center gap-3 rounded border border-line border-dashed px-4 active:opacity-80"
                >
                  <Text className="font-serif text-serif-lg text-accent">+</Text>
                  <Text className="font-ui text-body text-text">{t('rank.add_a_photo')}</Text>
                </Pressable>
              ))}
          </View>
        ))}

        {dishNudge && (
          <DishNudgeCard
            label={dishNudge.label}
            listId={dishNudge.listId}
            count={dishNudge.kind === 'first' ? 3 : undefined}
            onDismiss={onDismissNudge}
          />
        )}

        {/* The other half of the core loop: where friends put this same place. */}
        <View className="mt-6">
          <Eyebrow>{t('rank.your_friends')}</Eyebrow>
          {friendsPending ? (
            <Caption className="mt-1">{t('rank.searching')}</Caption>
          ) : friendsRankings.length > 0 ? (
            <>
              <Caption className="mt-1">
                {t('rank.friends_ranked_count', { n: friendsRankings.length })} ·{' '}
                {t('rank.avg_abbrev')}{' '}
                <Text style={DATA_FIGURES} className="text-accent">
                  {displayScore(friendAvg)}
                </Text>
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
                    <Text
                      style={DATA_FIGURES}
                      className="font-ui-medium text-eyebrow text-text-muted"
                    >
                      #{f.position}
                    </Text>
                    <ScoreBadge size="sm" score={f.score} attribution={{ kind: 'stated' }} />
                  </Pressable>
                </Link>
              ))}
            </>
          ) : (
            <SerifItalic className="mt-1 text-serif-sm">{t('rank.no_friends_ranked')}</SerifItalic>
          )}
        </View>

        {commitPending ? (
          <View className="mt-4 items-center">
            <Caption>{t('rank.saving_ranking')}</Caption>
          </View>
        ) : commitError ? (
          <View className="mt-4 flex-row items-center justify-center gap-3">
            <Caption>{t('rank.commit_error')}</Caption>
            <Pressable
              accessibilityRole="button"
              onPress={onRetryCommit}
              className="active:opacity-60"
            >
              <Text className="font-ui-medium text-label text-accent-strong">
                {t('rank.retry_short')}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <Body className="mt-6 text-center text-text-muted">
          {t('rank.your_answer_moved', { name: picked.name })}
        </Body>
        {/* Two clear ways out: finish now (everything above is already
            saved), or keep going to a note. "Agregar una nota" used to be the
            only button, so logging dishes WITHOUT a note meant finding the
            small "Listo" up top or swiping the sheet away. */}
        <View className="mt-4 gap-3">
          {selectedDishes.length > 0 && !dishSyncPending ? (
            <View className="flex-row items-center justify-center gap-1.5">
              <CheckIcon size={14} color="accent" />
              <Caption className="font-ui-medium text-accent-strong">
                {t('rank.dishes_saved', { n: selectedDishes.length })}
              </Caption>
            </View>
          ) : null}
          <Button variant="primary" disabled={listoBlocked} onPress={finish}>
            {saving ? t('common.saving') : t('rank.finish')}
          </Button>
          <Button variant="secondary" disabled={dishSyncPending} onPress={onAddNote}>
            {t('rank.add_a_note')}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}

// B4 — note + occasion tags. Every dish was already saved on the reveal
// (M13), so this step only finalizes the optional note/tags themselves.
function NoteStep({
  picked,
  position,
  existingCount,
  note,
  setNote,
  tags,
  setTags,
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
  saving: boolean
  onBack: () => void
  onSave: () => void
}) {
  const insets = useSafeAreaInsets()
  const placeholder = useColor('text-muted')
  const t = useT()

  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <View className="flex-row items-center justify-between">
        <BackBar label={t('rank.add_note_back')} onBack={onBack} />
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={onSave}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
            {t('common.done')}
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
          <ScoreBadge
            score={scoreForPosition(position - 1, existingCount + 1)}
            attribution={{ kind: 'you' }}
          />
        </View>

        <TextInput
          className="mt-4 min-h-[84px] rounded border border-line bg-surface p-3 font-ui text-body text-text"
          placeholderTextColor={placeholder}
          placeholder={t('rank.note_placeholder')}
          maxLength={140}
          multiline
          inputAccessoryViewID="rank-note"
          value={note}
          onChangeText={setNote}
        />

        <KeyboardDone id="rank-note" />

        <Eyebrow className="mt-4">{t('rank.occasion')}</Eyebrow>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {OCCASION_TAGS.map((tag) => {
            const on = tags.includes(tag)
            return (
              <Chip
                key={tag}
                size="sm"
                state={on ? 'selected' : 'default'}
                onPress={() =>
                  setTags((cur) =>
                    on ? cur.filter((x) => x !== tag) : cur.length < 4 ? [...cur, tag] : cur,
                  )
                }
              >
                {tagLabel(tag)}
              </Chip>
            )
          })}
        </View>

        <View className="mt-6">
          <Button variant="primary" disabled={saving} onPress={onSave}>
            {saving ? t('common.saving') : t('rank.save_note')}
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
  const t = useT()
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
    return <Body className="mt-6">{t('rank.placing')}</Body>
  }

  const step = answered + 1
  const total = answered + comparisonsLeft(state)
  const pivotPos = state.ordered.findIndex((x) => x.id === comparison.pivot.id) + 1

  return (
    <View className="mt-4 gap-4">
      <Text style={DATA_FIGURES} className="font-ui-medium text-eyebrow text-text-muted">
        {step} de {total}
      </Text>
      <View className="items-center gap-1">
        <Title>{t('rank.which_was_better')}</Title>
        <Text className="text-center text-eyebrow text-text-muted">
          {t('rank.your_answer_moves', { name: item.name })}
        </Text>
      </View>
      <View className="gap-3">
        <CompareCard
          item={comparison.current}
          subline={isRerank ? t('rank.already_on_list') : t('rank.new_on_list')}
          onPress={() => {
            tapSelect()
            setAnswered((a) => a + 1)
            setState((s) => choose(s, true))
          }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            tapSelect()
            setAnswered((a) => a + 1)
            setState((s) => tie(s))
          }}
          className="min-h-[44px] items-center justify-center rounded-pill border border-line active:opacity-70"
        >
          <Text className="font-ui-semibold text-eyebrow text-text-muted uppercase tracking-eyebrow">
            {t('rank.roughly_equal')}
          </Text>
        </Pressable>
        <CompareCard
          item={comparison.pivot}
          subline={t('rank.position_on_list', { position: pivotPos })}
          score={comparison.pivot.score ?? null}
          onPress={() => {
            tapSelect()
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
  const t = useT()
  return (
    <AnimatedPressable
      entering={FadeIn.duration(180)}
      onPress={onDismiss}
      className="absolute inset-0 items-center justify-center bg-overlay-scrim px-6"
    >
      <Animated.View entering={FadeInDown.springify().damping(16)} className="w-full">
        <Card raised onStartShouldSetResponder={() => true} className="gap-2">
          <Eyebrow>{t('rank.how_it_works')}</Eyebrow>
          <Title>{t('rank.no_stars_only_compare')}</Title>
          <View className="my-1 flex-row gap-2">
            <Chip size="sm" state="selected">
              {t('rank.this_one')}
            </Chip>
            <Chip size="sm">{t('rank.or_this_one')}</Chip>
          </View>
          <Body>{t('rank.explainer_body')}</Body>
          <Button variant="primary" onPress={onDismiss}>
            {t('rank.got_it')}
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
  const t = useT()
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
  // candList already comes server-pre-filtered by q/openNow; only `existing`
  // (my own list, always fetched in full) needs client filtering.
  const existingFiltered = existing.filter((r) => {
    if (openNow && !r.closesAt) return false
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
            distance={dist != null ? formatDistance(dist) : null}
          />
        </View>
        {r.score != null ? (
          <ScoreBadge size="sm" score={r.score} attribution={{ kind: 'you' }} />
        ) : (
          <Text className="font-ui-semibold text-eyebrow text-text-faint uppercase tracking-eyebrow">
            {t('rank.unranked')}
          </Text>
        )}
      </Pressable>
    )
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <View className="px-5">
        <BackBar label={t('rank.back')} onBack={onBack} />
        <Title className="mt-4">{t('rank.find_title')}</Title>
        <TextInput
          className="mt-4 min-h-[48px] rounded border border-line bg-surface px-4 font-ui text-body text-text"
          placeholderTextColor={placeholder}
          placeholder={t('rank.find_placeholder')}
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
            {t('rank.nearby')}
          </Chip>
          {showOpenChip && (
            <Chip
              size="sm"
              state={openNow ? 'selected' : 'default'}
              onPress={() => setOpenNow((v) => !v)}
            >
              {t('rank.open_now')}
            </Chip>
          )}
        </ChipRail>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pt-4 pb-10"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        {leadGroup.length === 0 && results.length === 0 && !q ? (
          <Body>{t('rank.ranked_everything')}</Body>
        ) : leadGroup.length === 0 && results.length === 0 ? (
          <Body>{t('rank.no_matches')}</Body>
        ) : (
          <>
            {leadGroup.length > 0 && (
              <>
                <Eyebrow>{t('rank.want_to_try')}</Eyebrow>
                {leadGroup.map(renderRow)}
                <Eyebrow className="mt-3">{t('rank.all')}</Eyebrow>
              </>
            )}
            {results.map(renderRow)}
          </>
        )}

        {!adding && (
          <ExternalResults
            heading={<Eyebrow className="mt-3">{t('rank.on_google')}</Eyebrow>}
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
              {t('rank.add_restaurant_cta')}
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
  const t = useT()
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
        placeholder={t('rank.restaurant_name_placeholder')}
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <Text className="font-ui-semibold text-eyebrow text-text-muted uppercase tracking-eyebrow">
        {t('rank.sector')}
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
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          className="w-auto min-h-[44px] px-5"
          disabled={!canAdd}
          onPress={() => addPlace.mutate({ name: name.trim(), neighborhoodSlug: slug })}
        >
          {addPlace.isPending ? t('rank.adding') : t('rank.add_and_rank')}
        </Button>
      </View>
    </View>
  )
}
