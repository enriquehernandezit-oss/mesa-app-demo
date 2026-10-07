import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { type FocusEvent, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FollowerPicker } from '@/components/FollowerPicker'
import {
  Button,
  Caption,
  Card,
  Chip,
  ChipRail,
  Eyebrow,
  RowsSkeleton,
  Serif,
  MAX_SCALE,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { CheckCircle } from '@/components/ui/CheckCircle'
import { Field } from '@/components/ui/Field'
import { SearchIcon } from '@/components/ui/icons'
import { PlaceLine } from '@/components/ui/PlaceLine'
import { SheetHeader, SheetTitle } from '@/components/ui/SheetHeader'
import { showActionSheet } from '@/lib/actionSheet'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { bringToTop, scrollViewHost } from '@/lib/bringToTop'
import { captureError } from '@/lib/errors'
import { tapSelect, tapSuccess } from '@/lib/haptics'
import { dateLocale, useT } from '@/lib/i18n'
import { modalAlert } from '@/lib/modalAlert'
import { usePreventRemove } from '@/lib/preventRemove'
import { registerForPush } from '@/lib/push'
import { dayChipLabel, timeChipLabel } from '@/lib/time'
import type { ExploreResponse, FollowUser } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { DATA_FIGURES } from '@/theme/vars'

// A plan's spot: the slice of GET /restaurants' ExploreHit this screen
// actually renders/sends — kept narrow rather than importing ExploreHit
// itself, since candidates come from BOTH the search results and (in review)
// spots already picked, and only these fields are ever read.
type PlanSpot = {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: string | null
  priceTier: number | null
}

type TimeSlot = { h: number; m: number; nextDay: boolean }
type Step = 'spots' | 'when' | 'who' | 'review'
const STEP_ORDER: Step[] = ['spots', 'when', 'who', 'review']

function buildTimeSlots(startMin: number, endMin: number, stepMin: number): TimeSlot[] {
  const out: TimeSlot[] = []
  for (let t = startMin; t <= endMin; t += stepMin) {
    const normalized = ((t % 1440) + 1440) % 1440
    out.push({ h: Math.floor(normalized / 60), m: normalized % 60, nextDay: t >= 1440 })
  }
  return out
}
// The dinner window most Planes fall in, so it's the default rail — "Otra
// hora" expands to everything else (lunch through the small hours) rather
// than repeating these.
const DEFAULT_TIMES = buildTimeSlots(19 * 60, 23 * 60, 30)
const EXTRA_TIMES = buildTimeSlots(12 * 60, 25 * 60, 30).filter(
  (t) => !DEFAULT_TIMES.some((d) => d.h === t.h && d.m === t.m && d.nextDay === t.nextDay),
)
const sameSlot = (a: TimeSlot | null, b: TimeSlot) =>
  a != null && a.h === b.h && a.m === b.m && a.nextDay === b.nextDay
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()
function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  copy.setDate(copy.getDate() + n)
  return copy
}

// New plan (M3): create a dinner — up to 3 candidate spots (1 = fixed
// venue, 2-3 = a vote), a day/time chip picker (no date-picker library is
// installed, see the M3 plan doc), and an invitee list drawn from the host's
// own followers. One route on local state, same shape as rank.tsx: `step`
// walks forward with "Continuar" and backward with beforeRemove, which also
// guards the drag-to-dismiss / edge-swipe against silently losing a
// half-built plan. Redesign 2: each step is a page sheet — a round Close/Back chip, the sheet's
// name, the question in the serif, and one solid button at the foot.
export default function NewPlanScreen() {
  const t = useT()
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()

  // Prefilled from "Armar un plan" on an event's detail page (M21) — a
  // restaurant arriving this way means the venue is already decided, so the
  // flow skips straight past the spot-search step (spots' one entry already
  // IS the venue) and seeds the date/time from the event's own startsAt.
  // Nothing here is a special "event plan" mode: once seeded, this is a
  // completely ordinary plan the member can still edit at every step,
  // including dropping the spot entirely and picking a different one.
  const params = useLocalSearchParams<{
    restaurantId?: string
    restaurantName?: string
    cuisine?: string
    coverImageId?: string
    neighborhood?: string
    priceTier?: string
    startsAt?: string
    note?: string
  }>()
  const prefillSpot: PlanSpot | null = params.restaurantId
    ? {
        id: params.restaurantId,
        name: params.restaurantName ?? '',
        cuisine: params.cuisine || null,
        coverImageId: params.coverImageId || null,
        neighborhood: params.neighborhood || null,
        priceTier: params.priceTier ? Number(params.priceTier) : null,
      }
    : null
  const prefillDate = params.startsAt ? new Date(params.startsAt) : null

  const [step, setStep] = useState<Step>(prefillSpot ? 'when' : 'spots')
  const [spots, setSpots] = useState<PlanSpot[]>(prefillSpot ? [prefillSpot] : [])
  const [created, setCreated] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const [query, setQuery] = useState('')
  const today = useMemo(() => new Date(), [])
  const [day, setDay] = useState<Date>(prefillDate ?? today)
  // `nextDay: false` — day and time are read from the SAME prefillDate, so
  // there's no rollover to express (see resolvedDate below for how the two
  // recombine; nextDay only matters for a chip like "1:00 AM" picked
  // relative to a separately-chosen day).
  const [time, setTime] = useState<TimeSlot | null>(
    prefillDate ? { h: prefillDate.getHours(), m: prefillDate.getMinutes(), nextDay: false } : null,
  )
  const [showExtraTimes, setShowExtraTimes] = useState(false)
  const [invitees, setInvitees] = useState<Map<string, FollowUser>>(new Map())
  const [note, setNote] = useState(params.note ?? '')

  const goBack = () => {
    if (step === 'spots') {
      router.back()
      return
    }
    setStep(STEP_ORDER[STEP_ORDER.indexOf(step) - 1])
  }

  // Swipe-down-to-dismiss (and Android hardware back) closes the modal
  // outright rather than stepping back one step — the header's Close/Back chip above
  // already does the stepping, on every step. An empty flow (no spot picked
  // yet) just closes; once a spot is picked, confirm before throwing it away.
  // `created` lifts the guard: a successful create replaces this screen with the plan, and without
  // it that replace asked "Discard plan?" over a plan that now exists (cancelling left you on the
  // form, one tap from creating a duplicate).
  usePreventRemove(spots.length > 0 && !created, ({ data }) => {
    showActionSheet({
      title: t('plans.discard_title'),
      options: [{ label: t('plans.discard_button'), destructive: true }],
    }).then((idx) => {
      if (idx === 0) navigation.dispatch(data.action)
    })
  })

  const debouncedQ = useDebounced(query.trim(), 300)
  const results = useQuery({
    queryKey: ['plan-spots', debouncedQ],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedQ.length >= 2) params.set('q', debouncedQ)
      return api.get<ExploreResponse>(`/restaurants?${params}`)
    },
  })

  function toggleSpot(item: PlanSpot) {
    setSpots((prev) => {
      if (prev.some((s) => s.id === item.id)) return prev.filter((s) => s.id !== item.id)
      if (prev.length >= 3) {
        modalAlert(t('plans.max_spots_toast'))
        return prev
      }
      tapSelect()
      return [...prev, item]
    })
  }

  function isTimeDisabled(t: TimeSlot): boolean {
    const candidate = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate() + (t.nextDay ? 1 : 0),
      t.h,
      t.m,
    )
    return candidate.getTime() < Date.now()
  }

  const resolvedDate = time
    ? new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate() + (time.nextDay ? 1 : 0),
        time.h,
        time.m,
      )
    : null
  const resolvedLabel =
    resolvedDate && time
      ? `${new Intl.DateTimeFormat(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(resolvedDate)}, ${timeChipLabel(time.h, time.m)}`
      : null

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/plans', {
        restaurantIds: spots.map((s) => s.id),
        startsAt: resolvedDate?.toISOString(),
        note: note.trim() || undefined,
        inviteeIds: [...invitees.keys()],
      }),
    onSuccess: ({ id }) => {
      setCreated(true)
      tapSuccess()
      const daysAhead = resolvedDate
        ? Math.round((resolvedDate.getTime() - today.getTime()) / 86_400_000)
        : 0
      track('plan_created', { options: spots.length, invitees: invitees.size, daysAhead })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      // Contextual push-permission prompt (M17) — see rank.tsx's own comment.
      void registerForPush()
      // Next tick, so the guard above has re-rendered as lifted before the screen is replaced.
      setTimeout(() => router.replace(`/plans/${id}`), 0)
    },
    onError: (err) => {
      captureError(err, 'plans.create')
      const code = err instanceof ApiError ? err.code : ''
      // Two failures that retrying cannot fix get their own message and no Retry.
      if (code === 'invalid_invitees') return modalAlert(t('plans.invalid_invitees_error'))
      if (code === 'invalid_date') return modalAlert(t('plans.invalid_date_error'))
      modalAlert(t('plans.create_error'), () => create.mutate())
    },
  })

  return (
    <View className="flex-1 bg-bg">
      <SheetHeader
        label={t('plans.new_table')}
        onClose={step === 'spots' ? goBack : undefined}
        onBack={step === 'spots' ? undefined : goBack}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-6"
        // Tapping a search below slides it to the top (lib/bringToTop.ts); these let it get there.
        scrollToOverflowEnabled
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        // Scrolling the spot results hides the keyboard, like the other search lists.
        keyboardDismissMode="on-drag"
      >
        {step === 'spots' && (
          <SpotsStep
            spots={spots}
            query={query}
            setQuery={setQuery}
            results={results.data?.restaurants ?? []}
            isPending={results.isPending}
            onToggle={toggleSpot}
            onSearchFocus={(e) => bringToTop(scrollViewHost(scrollRef), e)}
          />
        )}
        {step === 'when' && (
          <WhenStep
            today={today}
            day={day}
            setDay={setDay}
            time={time}
            setTime={setTime}
            showExtraTimes={showExtraTimes}
            setShowExtraTimes={setShowExtraTimes}
            isTimeDisabled={isTimeDisabled}
            resolvedLabel={resolvedLabel}
          />
        )}
        {step === 'who' && (
          <>
            <SheetTitle>{t('plans.who_title')}</SheetTitle>
            <Caption className="mt-2 px-5 text-pill">{t('plans.no_followers_body')}</Caption>
            <View className="mt-4 px-4">
              <FollowerPicker
                onSearchFocus={(e) => bringToTop(scrollViewHost(scrollRef), e)}
                selected={new Set(invitees.keys())}
                onToggle={(user) =>
                  setInvitees((prev) => {
                    const next = new Map(prev)
                    if (next.has(user.id)) next.delete(user.id)
                    else next.set(user.id, user)
                    return next
                  })
                }
              />
            </View>
          </>
        )}
        {step === 'review' && (
          <ReviewStep
            spots={spots}
            resolvedLabel={resolvedLabel}
            invitees={[...invitees.values()]}
            note={note}
            setNote={setNote}
          />
        )}
      </ScrollView>

      <View className="px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 16) + 4 }}>
        {step === 'review' ? (
          <Button
            loading={create.isPending}
            disabled={create.isPending}
            onPress={() => create.mutate()}
          >
            {t('plans.create_button')}
          </Button>
        ) : (
          <Button
            disabled={
              (step === 'spots' && spots.length === 0) ||
              (step === 'when' && !time) ||
              (step === 'who' && invitees.size === 0)
            }
            onPress={() => setStep(STEP_ORDER[STEP_ORDER.indexOf(step) + 1])}
          >
            {t('plans.continue_button')}
          </Button>
        )}
      </View>
    </View>
  )
}

function SpotsStep({
  spots,
  query,
  setQuery,
  results,
  isPending,
  onToggle,
  onSearchFocus,
}: {
  spots: PlanSpot[]
  query: string
  setQuery: (v: string) => void
  results: PlanSpot[]
  isPending: boolean
  onToggle: (item: PlanSpot) => void
  onSearchFocus: (e: FocusEvent) => void
}) {
  const t = useT()
  const selectedIds = new Set(spots.map((s) => s.id))
  return (
    <>
      <SheetTitle>{t('plans.where_title')}</SheetTitle>
      <View className="mt-4 px-4">
        <Field
          icon={<SearchIcon size={18} color="text-muted" />}
          value={query}
          onChangeText={setQuery}
          placeholder={t('plans.search_spot_placeholder')}
          onFocus={onSearchFocus}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      </View>
      {spots.length > 0 && (
        <View className="mt-3 flex-row flex-wrap gap-2 px-5">
          {spots.map((s) => (
            <Chip key={s.id} state="selected" size="sm" onPress={() => onToggle(s)}>
              {s.name} ✕
            </Chip>
          ))}
        </View>
      )}
      <Caption className="mt-3 px-5 text-meta">{t('plans.spot_rule_caption')}</Caption>

      <View className="mt-2 px-5">
        {isPending ? (
          <RowsSkeleton />
        ) : (
          results.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedIds.has(r.id) }}
              onPress={() => onToggle(r)}
              className="py-2 active:opacity-80"
            >
              <PlaceLine
                name={r.name}
                coverImageId={r.coverImageId}
                cuisine={r.cuisine}
                neighborhood={r.neighborhood}
                priceTier={r.priceTier}
                nameClass="text-serif-sm"
                right={<CheckCircle on={selectedIds.has(r.id)} />}
              />
            </Pressable>
          ))
        )}
      </View>
    </>
  )
}

function WhenStep({
  today,
  day,
  setDay,
  time,
  setTime,
  showExtraTimes,
  setShowExtraTimes,
  isTimeDisabled,
  resolvedLabel,
}: {
  today: Date
  day: Date
  setDay: (d: Date) => void
  time: TimeSlot | null
  setTime: (t: TimeSlot) => void
  showExtraTimes: boolean
  setShowExtraTimes: (v: boolean) => void
  isTimeDisabled: (t: TimeSlot) => boolean
  resolvedLabel: string | null
}) {
  const t = useT()
  const dayChips = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today])
  const timeChip = (t: TimeSlot) => {
    const disabled = isTimeDisabled(t)
    const selected = sameSlot(time, t)
    return (
      <Chip
        key={`${t.h}:${t.m}:${t.nextDay}`}
        state={selected ? 'selected' : 'default'}
        disabled={disabled}
        className={disabled ? 'opacity-40' : ''}
        onPress={() => {
          tapSelect()
          setTime(t)
        }}
      >
        {timeChipLabel(t.h, t.m)}
      </Chip>
    )
  }
  return (
    <>
      <SheetTitle>{t('plans.when_title')}</SheetTitle>
      <View className="px-5">
        <ChipRail className="mt-4">
          {dayChips.map((d) => (
            <Chip
              key={d.toISOString()}
              state={sameDay(d, day) ? 'selected' : 'default'}
              onPress={() => {
                tapSelect()
                setDay(d)
              }}
            >
              {dayChipLabel(d, today)}
            </Chip>
          ))}
        </ChipRail>
      </View>
      <View className="mt-4 flex-row flex-wrap gap-2 px-5">
        {DEFAULT_TIMES.map(timeChip)}
        {showExtraTimes ? (
          EXTRA_TIMES.map(timeChip)
        ) : (
          <Chip chevron onPress={() => setShowExtraTimes(true)}>
            {t('plans.other_time')}
          </Chip>
        )}
      </View>
      {resolvedLabel ? (
        <Serif className="mt-5 px-5 text-serif-md text-text">{resolvedLabel}</Serif>
      ) : null}
    </>
  )
}

function ReviewStep({
  spots,
  resolvedLabel,
  invitees,
  note,
  setNote,
}: {
  spots: PlanSpot[]
  resolvedLabel: string | null
  invitees: FollowUser[]
  note: string
  setNote: (v: string) => void
}) {
  const t = useT()
  const shown = invitees.slice(0, 6)
  const extra = invitees.length - shown.length
  return (
    <>
      <SheetTitle>{t('plans.review_title')}</SheetTitle>
      <Card className="mx-4 mt-4 gap-3">
        {spots.length > 1 ? (
          <View>
            <Eyebrow className="mb-1">{t('plans.voting_between')}</Eyebrow>
            {spots.map((s, i) => (
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                key={s.id}
                className="font-serif text-serif-md text-text"
              >
                {i + 1}. {s.name}
              </Text>
            ))}
          </View>
        ) : (
          <Text maxFontSizeMultiplier={MAX_SCALE} className="font-serif text-serif-md text-text">
            {spots[0]?.name}
          </Text>
        )}
        {resolvedLabel ? <Caption>{resolvedLabel}</Caption> : null}
        {invitees.length > 0 ? (
          <View className="flex-row items-center gap-1.5">
            {shown.map((u) => (
              <Avatar key={u.id} name={u.name || u.handle || 'm'} src={u.image} size={28} />
            ))}
            {extra > 0 ? (
              <Caption style={DATA_FIGURES} className="ml-1 font-ui-medium">
                +{extra}
              </Caption>
            ) : null}
          </View>
        ) : null}
      </Card>
      <View className="mt-4 px-4">
        <Field
          label={t('plans.note_label')}
          value={note}
          onChangeText={setNote}
          maxLength={140}
          multilineBox
        />
      </View>
    </>
  )
}
