import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FollowerPicker } from '@/components/FollowerPicker'
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
import { Field } from '@/components/ui/Field'
import { CheckIcon } from '@/components/ui/icons'
import { Characteristics } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { tapSelect, tapSuccess } from '@/lib/haptics'
import { dateLocale, useT } from '@/lib/i18n'
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
// half-built plan.
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
  // outright rather than stepping back one step — the visible BackBar above
  // already does the stepping, on every step. An empty flow (no spot picked
  // yet) just closes; once a spot is picked, confirm before throwing it away.
  usePreventRemove(spots.length > 0, ({ data }) => {
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
        toast({ variant: 'error', message: t('plans.max_spots_toast') })
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
      tapSuccess()
      const daysAhead = resolvedDate
        ? Math.round((resolvedDate.getTime() - today.getTime()) / 86_400_000)
        : 0
      track('plan_created', { options: spots.length, invitees: invitees.size, daysAhead })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      // Contextual push-permission prompt (M17) — see rank.tsx's own comment.
      void registerForPush()
      router.replace(`/plans/${id}`)
    },
    onError: (err) => {
      captureError(err, 'plans.create')
      const invalidInvitees = err instanceof ApiError && err.code === 'invalid_invitees'
      toast({
        variant: 'error',
        message: invalidInvitees ? t('plans.invalid_invitees_error') : t('plans.create_error'),
        action: invalidInvitees
          ? undefined
          : { label: t('common.retry'), onClick: () => create.mutate() },
      })
    },
  })

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <BackBar
          label={step === 'spots' ? t('plans.new_table_back') : t('common.back')}
          onBack={goBack}
        />

        {step === 'spots' && (
          <SpotsStep
            spots={spots}
            query={query}
            setQuery={setQuery}
            results={results.data?.restaurants ?? []}
            isPending={results.isPending}
            onToggle={toggleSpot}
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
            <Title className="mt-4">{t('plans.who_title')}</Title>
            <Body className="mt-1">{t('plans.no_followers_body')}</Body>
            <View className="mt-4">
              <FollowerPicker
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

      <View
        className="border-line border-t px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
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

function SpotsStep({
  spots,
  query,
  setQuery,
  results,
  isPending,
  onToggle,
}: {
  spots: PlanSpot[]
  query: string
  setQuery: (v: string) => void
  results: PlanSpot[]
  isPending: boolean
  onToggle: (item: PlanSpot) => void
}) {
  const t = useT()
  const selectedIds = new Set(spots.map((s) => s.id))
  return (
    <>
      <Title className="mt-4">{t('plans.where_title')}</Title>
      <Field
        className="mt-4"
        value={query}
        onChangeText={setQuery}
        placeholder={t('plans.search_spot_placeholder')}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
      />
      {spots.length > 0 && (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {spots.map((s) => (
            <Chip key={s.id} state="selected" size="sm" onPress={() => onToggle(s)}>
              {s.name} ✕
            </Chip>
          ))}
        </View>
      )}
      <Caption className="mt-3">{t('plans.spot_rule_caption')}</Caption>

      <View className="mt-2">
        {isPending ? (
          <RowsSkeleton />
        ) : (
          results.map((r) => {
            const selected = selectedIds.has(r.id)
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onToggle(r)}
                className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80"
              >
                <PlaceCover
                  seed={r.id}
                  name={r.name}
                  coverImageId={r.coverImageId}
                  size={{ w: 160, h: 160 }}
                  className="h-14 w-14"
                />
                <View className="min-w-0 flex-1">
                  <Text className="font-serif text-serif-md text-text" numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Characteristics
                    priceTier={r.priceTier}
                    cuisine={r.cuisine}
                    neighborhood={r.neighborhood}
                  />
                </View>
                {selected ? <CheckIcon size={18} color="accent" /> : null}
              </Pressable>
            )
          })
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
        size="sm"
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
      <Title className="mt-4">{t('plans.when_title')}</Title>
      <ChipRail className="mt-4">
        {dayChips.map((d) => (
          <Chip
            key={d.toISOString()}
            size="sm"
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
      <View className="mt-4 flex-row flex-wrap gap-2">
        {DEFAULT_TIMES.map(timeChip)}
        {showExtraTimes ? (
          EXTRA_TIMES.map(timeChip)
        ) : (
          <Chip size="sm" chevron onPress={() => setShowExtraTimes(true)}>
            {t('plans.other_time')}
          </Chip>
        )}
      </View>
      {resolvedLabel ? (
        <SerifItalic className="mt-5 text-serif-sm">{resolvedLabel}</SerifItalic>
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
      <Title className="mt-4">{t('plans.review_title')}</Title>
      <Card className="mt-4 gap-3">
        {spots.length > 1 ? (
          <View>
            <Eyebrow className="mb-1">{t('plans.voting_between')}</Eyebrow>
            {spots.map((s, i) => (
              <Text key={s.id} className="font-ui text-body text-text">
                {i + 1}. {s.name}
              </Text>
            ))}
          </View>
        ) : (
          <Text className="font-serif text-serif-md text-text">{spots[0]?.name}</Text>
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
      <View className="mt-4">
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
