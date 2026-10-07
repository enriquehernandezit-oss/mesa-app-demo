import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { FollowPill, PersonRow } from '@/components/PersonRow'
import { SectorPicker } from '@/components/SectorPicker'
import { Body, Button, Caption, ErrorState, Eyebrow, Serif, MAX_SCALE } from '@/components/ui'
import { CompareCard } from '@/components/ui/CompareCard'
import { Field } from '@/components/ui/Field'
import { CheckIcon, LocateIcon, PeopleIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useProfile } from '@/hooks/useProfile'
import { showActionSheet } from '@/lib/actionSheet'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { signOut, useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { bringToTop, scrollViewHost } from '@/lib/bringToTop'
import { contactsAvailable, importContactPhones } from '@/lib/contacts'
import { cuisineLabel } from '@/lib/display'
import { captureError } from '@/lib/errors'
import { tapSuccess } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { nearestSector } from '@/lib/nearestSector'
import { choose, initPairwise, isDone, nextComparison, progress, skip, tie } from '@/lib/pairwise'
import { takePendingInvite } from '@/lib/pendingInvite'
import { resetToSignIn } from '@/lib/resetToSignIn'
import { parseBirthdayIso } from '@/lib/time'
import type { MeResponse, Neighborhood, Restaurant, SuggestedUser } from '@/lib/types'
import { currentLocationStatus, requestMyLocation } from '@/lib/useMyLocation'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// Cold-start fix — the #1 product risk is an empty first open, so onboarding is
// first-class. A new profile leaves this flow with an identity, a starter
// ranking, and at least a few friends: never empty, never friendless. Ported
// from apps/app/src/screens/Onboarding.tsx + its three step files.
//
// The flow owns its own step state and does NOT invalidate ['me'] between steps.
// If it did, the moment the ranking step wrote its rows the gate would see
// onboardingComplete flip true and yank the member into the tab shell before
// friend-find. We refresh ['me'] exactly once, at the end.
const CONTACT_BATCH = 1000
const STEPS = ['profile', 'rank', 'friends'] as const
type Step = (typeof STEPS)[number]

export default function Onboarding() {
  const authLost = useAuthLost()
  const { data: session, isPending } = useSession()
  const authed = Boolean(session?.user)
  const { data: me } = useProfile(authed && !authLost)
  // Where sign-up starts: someone who left after saving step 1 (and signed in again) picks up at the
  // starter list instead of filling the profile in twice. Decided once, when /me first arrives.
  const [step, setStep] = useState<Step | null>(null)
  useEffect(() => {
    if (step === null && me) setStep(me.profileStepDone ? 'rank' : 'profile')
  }, [step, me])
  const queryClient = useQueryClient()
  const router = useRouter()
  const t = useT()

  if (authLost || (!isPending && !authed)) return <Redirect href="/sign-in" />
  if (me?.onboardingComplete) return <Redirect href="/discover" />

  function finish() {
    track('onboarding_completed')
    tapSuccess()
    // Attribute this signup to whoever's link opened the app, if any.
    // Fire-and-forget: an unknown or already-used code is not an error the
    // member should ever see, and nothing here gates the app.
    void takePendingInvite().then((code) => {
      if (code) api.post('/invites/redeem', { code }).catch(() => {})
    })
    // Now the gate re-reads: profile + ranking + eula are all set → tab shell.
    queryClient.invalidateQueries({ queryKey: ['me'] })
    router.replace('/discover')
  }

  const stepIndex = step ? STEPS.indexOf(step) : 0

  // A way out of sign-up at any step. The account already exists (it was made on the screen before), so
  // "leaving" is either signing out to finish later, or deleting it — the same page as Settings uses.
  async function leave() {
    const i = await showActionSheet({
      title: t('onboarding.exit_title'),
      message: t('onboarding.exit_body'),
      options: [
        { label: t('onboarding.exit_sign_out') },
        { label: t('onboarding.exit_delete'), destructive: true },
      ],
    })
    if (i === 0) {
      await signOut().catch(() => {})
      resetToSignIn(router)
    } else if (i === 1) {
      router.push('/settings/delete-account')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      {/* Opaque and above the step below it. Each step owns a ScrollView, and
          its content was passing THROUGH this bar once scrolled — the
          subtitle rendered straight across "Step 1 of 3", two lines of text
          on the same pixels. A transparent, un-layered bar over a sibling
          scroller has nothing to hide content behind it; this gives it both
          a ground of its own and a place in the stacking order. */}
      <View className="bg-bg px-5 pt-2 pb-2" style={{ zIndex: 1 }}>
        <View className="flex-row gap-1.5">
          {STEPS.map((s, i) => (
            <View
              key={s}
              className={`h-1 flex-1 rounded-pill ${i <= stepIndex ? 'bg-ink' : 'bg-bg-sunk'}`}
            />
          ))}
        </View>
        <View className="mt-1 flex-row items-center justify-between">
          <Caption className="text-micro">
            {t('onboarding.step_progress', { step: stepIndex + 1, total: STEPS.length })}
          </Caption>
          <Pressable
            accessibilityRole="button"
            onPress={leave}
            hitSlop={8}
            className="min-h-[32px] justify-center pl-3 active:opacity-60"
          >
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-label text-text-muted"
            >
              {t('onboarding.exit')}
            </Text>
          </Pressable>
        </View>
      </View>

      {step === null && <Body className="px-5 pt-8">{t('onboarding.loading_spots')}</Body>}
      {step === 'profile' && me && (
        <ProfileStep initial={me.profile} onNext={() => setStep('rank')} />
      )}
      {step === 'rank' && <RankStep onNext={() => setStep('friends')} />}
      {step === 'friends' && <FriendsStep onFinish={finish} />}
    </SafeAreaView>
  )
}

// Step 1: identity. Name, @handle, home sector, and the EULA/terms accept a UGC
// app needs at signup (App Store 1.2).
// What is already on the account fills step 1 in: the name Google or Apple gave, and anything saved
// on an earlier, unfinished try. An email sign-up's name is the address's first part (a placeholder the
// server needs), so it is left for the member to type.
function initialName(p: MeResponse['profile']): string {
  const placeholder = p.email?.split('@')[0]
  return p.name && p.name !== placeholder && !p.email?.endsWith('@phone.mesa.local') ? p.name : ''
}

function ProfileStep({ initial, onNext }: { initial: MeResponse['profile']; onNext: () => void }) {
  const t = useT()
  const [name, setName] = useState(() => initialName(initial))
  const [handle, setHandle] = useState(initial.handle ?? '')
  const [neighborhoodSlug, setNeighborhoodSlug] = useState(initial.neighborhood?.slug ?? '')
  // "Otro": lives outside the sectors, and says where instead.
  const [otherArea, setOtherArea] = useState(Boolean(initial.homeArea))
  const [homeArea, setHomeArea] = useState(initial.homeArea ?? '')
  const setNeighborhood = (slug: string) => {
    setNeighborhoodSlug(slug)
    setOtherArea(false)
  }
  const [accepted, setAccepted] = useState(false)
  // Saved as YYYY-MM-DD.
  const [savedYear, savedMonth, savedDay] = (initial.birthday ?? '').split('-')
  const [birthDay, setBirthDay] = useState(savedDay ?? '')
  const [birthMonth, setBirthMonth] = useState(savedMonth ?? '')
  const [birthYear, setBirthYear] = useState(savedYear ?? '')

  const {
    data,
    isError: neighborhoodsError,
    refetch: refetchNeighborhoods,
  } = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  // "Usar mi ubicación": suggests the nearest sector. It only pre-selects — the person can still pick
  // another, and the note says which one it chose and why a suggestion might not be there.
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(
    null,
  )
  const useMyLocationForSector = async () => {
    setLocating(true)
    setLocationNote(null)
    const pos = await requestMyLocation()
    setLocating(false)
    if (!pos) {
      setLocationNote({
        text: t(
          currentLocationStatus() === 'denied'
            ? 'onboarding.location_denied'
            : 'onboarding.location_failed',
        ),
        tone: 'bad',
      })
      return
    }
    const found = nearestSector(pos, data?.neighborhoods ?? [])
    if (!found) {
      setLocationNote({ text: t('onboarding.location_no_sector'), tone: 'bad' })
      return
    }
    setNeighborhood(found.slug)
    setLocationNote({ text: t('onboarding.location_picked', { name: found.name }), tone: 'ok' })
  }

  // Instagram username — optional, stored without the "@" (it's a display
  // prefix). Blank simply omits it; the handle stays null.
  const igUser = handle.trim().replace(/@/g, '').toLowerCase()
  const handleProvided = igUser.length > 0
  const handleValid = !handleProvided || /^[a-z0-9_.]{2,30}$/.test(igUser)

  // Mandatory at signup (M23, founder's own data collection), private ever
  // after — see PATCH /me/birthday's header for why it's a separate call,
  // not a field folded into /me/profile below. A light sanity check only
  // (catches a typo like Feb 30 or a 2-digit year), not real age
  // verification — the same posture the server side takes.
  const birthday = useMemo(
    () => parseBirthdayIso(birthDay, birthMonth, birthYear),
    [birthDay, birthMonth, birthYear],
  )

  const save = useMutation({
    mutationFn: async () => {
      await api.patch('/me/profile', {
        name: name.trim(),
        ...(handleProvided ? { handle: igUser } : {}),
        ...(otherArea ? { homeArea: homeArea.trim() } : { neighborhoodSlug }),
        acceptEula: true,
      })
      if (!birthday) return // canSubmit already guards this; defensive only
      await api.patch('/me/birthday', { birthday })
    },
    onSuccess: () => {
      tapSuccess()
      onNext()
    },
  })

  const canSubmit =
    name.trim().length > 0 &&
    handleValid &&
    (otherArea ? homeArea.trim().length >= 2 : neighborhoodSlug !== '') &&
    accepted &&
    birthday !== null
  const errorText =
    save.error instanceof ApiError && save.error.code === 'handle_taken'
      ? t('onboarding.handle_taken')
      : save.isError
        ? t('onboarding.profile_save_error')
        : null
  const scrollRef = useRef<ScrollView>(null)

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-5 pt-6 pb-10"
      // Tapping a search below slides it to the top (lib/bringToTop.ts); these let it get there.
      scrollToOverflowEnabled
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
    >
      <StepTitle title={t('onboarding.who_are_you')} subtitle={t('onboarding.identity_subtitle')} />

      <Eyebrow className="mt-6 mb-2">{t('onboarding.name_label')}</Eyebrow>
      <Field
        placeholder={t('onboarding.name_placeholder')}
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={setName}
      />

      <Eyebrow className="mt-5 mb-2">{t('onboarding.handle_label')}</Eyebrow>
      <Field
        placeholder={t('onboarding.handle_placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        value={handle}
        onChangeText={(v) => setHandle(v.replace(/[^a-zA-Z0-9_.@]/g, ''))}
      />
      {/* This is what people tap "Compartir perfil" against later — skipping
          it silently breaks that share link, so the helper line says so up
          front instead of leaving it read as a pure Instagram field. */}
      <Caption className="mt-1">{t('onboarding.handle_helper')}</Caption>
      {handle.length > 0 && !handleValid && (
        <Caption className="mt-1 text-danger">{t('onboarding.handle_rules')}</Caption>
      )}

      <Eyebrow className="mt-5 mb-2">{t('rank.sector')}</Eyebrow>
      {/* Optional shortcut: the position is read once, here, on this tap, and only picks a sector. */}
      <Button
        variant="secondary"
        size="sm"
        className="mb-2.5 self-start px-4"
        icon={<LocateIcon size={15} />}
        disabled={locating || !data}
        onPress={useMyLocationForSector}
      >
        {locating ? t('onboarding.locating') : t('onboarding.use_location')}
      </Button>
      {locationNote ? (
        <Caption className={`mb-2.5 ${locationNote.tone === 'bad' ? 'text-danger' : ''}`}>
          {locationNote.text}
        </Caption>
      ) : null}
      {neighborhoodsError ? (
        <ErrorState onRetry={() => refetchNeighborhoods()}>
          {t('onboarding.neighborhoods_error')}
        </ErrorState>
      ) : (
        <SectorPicker
          sectors={data?.neighborhoods ?? []}
          selected={new Set(neighborhoodSlug ? [neighborhoodSlug] : [])}
          onToggle={setNeighborhood}
          size="sm"
          onSearchFocus={(e) => bringToTop(scrollViewHost(scrollRef), e)}
          other={{
            selected: otherArea,
            onPress: () => {
              setOtherArea(true)
              setNeighborhoodSlug('')
            },
          }}
        />
      )}
      {otherArea ? (
        <View className="mt-3">
          <Field
            label={t('sectors.other_label')}
            placeholder={t('sectors.other_placeholder')}
            value={homeArea}
            onChangeText={setHomeArea}
            autoCapitalize="words"
            maxLength={60}
            autoFocus
            // Room for the field's label above it.
            onFocus={(e) => bringToTop(scrollViewHost(scrollRef), e, { gap: 36 })}
          />
        </View>
      ) : null}

      <Eyebrow className="mt-5 mb-2">{t('onboarding.birthday_label')}</Eyebrow>
      <View className="flex-row gap-2">
        <Field
          className="flex-1"
          placeholder={t('onboarding.birthday_day')}
          keyboardType="number-pad"
          maxLength={2}
          value={birthDay}
          onChangeText={(v) => setBirthDay(v.replace(/\D/g, ''))}
        />
        <Field
          className="flex-1"
          placeholder={t('onboarding.birthday_month')}
          keyboardType="number-pad"
          maxLength={2}
          value={birthMonth}
          onChangeText={(v) => setBirthMonth(v.replace(/\D/g, ''))}
        />
        <Field
          style={{ flex: 1.6 }}
          placeholder={t('onboarding.birthday_year')}
          keyboardType="number-pad"
          maxLength={4}
          value={birthYear}
          onChangeText={(v) => setBirthYear(v.replace(/\D/g, ''))}
        />
      </View>
      {/* Sets expectations before anyone wonders why a food app wants this —
          same reasoning as the handle helper above. */}
      <Caption className="mt-1">{t('onboarding.birthday_helper')}</Caption>
      {birthDay.length > 0 && birthMonth.length > 0 && birthYear.length === 4 && !birthday && (
        <Caption className="mt-1 text-danger">{t('onboarding.birthday_invalid')}</Caption>
      )}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        onPress={() => setAccepted((v) => !v)}
        className="mt-6 min-h-[44px] flex-row items-start gap-3 active:opacity-70"
      >
        <View
          className={`h-6 w-6 items-center justify-center rounded-[7px] border ${accepted ? 'border-transparent bg-ink' : 'border-line-strong'}`}
        >
          {accepted && <CheckIcon size={14} color="on-ink" strokeWidth={2.6} />}
        </View>
        <Caption className="flex-1">{t('onboarding.eula_accept')}</Caption>
      </Pressable>

      {errorText && <Caption className="mt-3 text-danger">{errorText}</Caption>}

      <View className="mt-6">
        <Button
          variant="primary"
          disabled={!canSubmit || save.isPending}
          onPress={() => save.mutate()}
        >
          {save.isPending ? t('common.saving') : t('onboarding.continue')}
        </Button>
      </View>
    </ScrollView>
  )
}

// A step's title (serif 36) and the one line under it.
function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View>
      <Serif className="text-headline text-text">{title}</Serif>
      <Text maxFontSizeMultiplier={MAX_SCALE} className="mt-2 font-ui text-subhead text-text-muted">
        {subtitle}
      </Text>
    </View>
  )
}

// One spot in the "which of these have you been to?" grid: an r22 card, a photo,
// and — once picked — a solid check and a ring in the ink colour. The ring sits on
// an outer view because the inner one clips the photo to the corners.
function PickCard({
  restaurant: r,
  on,
  onPress,
}: {
  restaurant: Restaurant
  on: boolean
  onPress: () => void
}) {
  const lift = useLift()
  const ink = useColor('ink')
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      className="w-[48.5%] rounded-group bg-surface active:opacity-80"
      style={on ? { boxShadow: `0 0 0 2.5px ${ink}` } : lift}
    >
      <View className="overflow-hidden rounded-group">
        <View className="h-[104px]">
          <PlaceCover
            name={r.name}
            coverImageId={r.coverImageId}
            size={{ w: 400, h: 300 }}
            className="h-full w-full"
          />
          {on && (
            <View className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-pill border-2 border-bg bg-ink">
              <CheckIcon size={15} color="on-ink" strokeWidth={2.6} />
            </View>
          )}
        </View>
        <View className="px-3 pb-3 pt-2">
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-sm text-text"
            numberOfLines={1}
          >
            {r.name}
          </Text>
          <Caption className="text-micro" numberOfLines={1}>
            {[cuisineLabel(r.cuisine), r.neighborhood?.name].filter(Boolean).join(' · ')}
          </Caption>
        </View>
      </View>
    </Pressable>
  )
}

// Step 2: the atomic mechanic. First pick the spots you've actually been to (you
// can't rank a place you haven't visited), then place them with a few pairwise
// comparisons. The settled order becomes the starter ranking. No stars, anywhere.
// The most popular places on Mesa (GET /onboarding/candidates); pick the 1–5 you like most. One is
// saved as it is — there is nothing to compare it with.
const MIN_TO_RANK = 1
const MAX_TO_RANK = 5

function RankStep({ onNext }: { onNext: () => void }) {
  const t = useT()
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['onboarding', 'candidates'],
    queryFn: () => api.get<{ restaurants: Restaurant[] }>('/onboarding/candidates'),
  })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [phase, setPhase] = useState<'select' | 'compare'>('select')

  const byId = useMemo(() => {
    const m = new Map<string, Restaurant>()
    for (const r of data?.restaurants ?? []) m.set(r.id, r)
    return m
  }, [data])

  const save = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.post('/onboarding/rankings', { restaurantIds: orderedIds }),
    onSuccess: onNext,
  })

  if (isPending) return <Body className="px-5 pt-8">{t('onboarding.loading_spots')}</Body>
  if (isError) {
    return (
      <View className="flex-1 items-center justify-center px-5">
        <ErrorState onRetry={() => refetch()}>{t('onboarding.spots_error')}</ErrorState>
      </View>
    )
  }

  if (phase === 'select') {
    const toggle = (id: string) =>
      setSelectedIds((cur) =>
        cur.includes(id)
          ? cur.filter((x) => x !== id)
          : cur.length >= MAX_TO_RANK
            ? cur
            : [...cur, id],
      )
    return (
      <View className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pt-6 pb-4">
          <StepTitle
            title={t('onboarding.which_have_you_been')}
            subtitle={t('onboarding.choose_range', {
              count: data?.restaurants.length ?? 0,
              max: MAX_TO_RANK,
            })}
          />
          <Caption className="mt-2 font-ui-semibold">
            {t('onboarding.picked_of', { n: selectedIds.length, max: MAX_TO_RANK })}
          </Caption>
          <View className="mt-5 flex-row flex-wrap justify-between gap-y-3">
            {data?.restaurants.map((r) => (
              <PickCard
                key={r.id}
                restaurant={r}
                on={selectedIds.includes(r.id)}
                onPress={() => toggle(r.id)}
              />
            ))}
          </View>
        </ScrollView>
        <View className="px-5 pb-4">
          <Button
            variant="primary"
            disabled={selectedIds.length < MIN_TO_RANK || save.isPending}
            onPress={() =>
              selectedIds.length === 1 ? save.mutate(selectedIds) : setPhase('compare')
            }
          >
            {selectedIds.length < MIN_TO_RANK
              ? t('onboarding.choose_more')
              : selectedIds.length === 1
                ? t('onboarding.save_favorite')
                : t('onboarding.rank_these', { n: selectedIds.length })}
          </Button>
          {save.isError ? (
            <Caption className="mt-2 text-center text-danger">
              {t('onboarding.save_rankings_error')}
            </Caption>
          ) : null}
        </View>
      </View>
    )
  }

  return (
    <ComparePhase
      restaurants={selectedIds.map((id) => byId.get(id)).filter(Boolean) as Restaurant[]}
      save={save}
    />
  )
}

function ComparePhase({
  restaurants,
  save,
}: {
  restaurants: Restaurant[]
  save: UseMutationResult<unknown, unknown, string[]>
}) {
  const t = useT()
  const [state, setState] = useState(() => initPairwise(restaurants))
  const comparison = nextComparison(state)
  const { placed, total } = progress(state)
  const finished = comparison === null && isDone(state)
  const submit = () => save.mutate(state.ordered.map((r) => r.id))

  // Persist the finished order exactly once. Calling `save.mutate` directly in
  // the render body (the previous shape) re-fired on every render once `save`
  // settled back to `!isPending` — including after a FAILED save, which turned
  // one network hiccup into a silent, infinite retry loop with no error ever
  // reaching the screen. `isIdle` only guards the automatic first attempt; the
  // retry button below calls `save.mutate` directly regardless of status.
  // `submit` closes over `state` and is recreated every render; including it
  // as a dependency would defeat the isIdle guard below by re-running every
  // render instead of once when the order actually finishes.
  // oxlint-disable react/exhaustive-deps -- see above.
  useEffect(() => {
    if (finished && save.isIdle) submit()
  }, [finished, save.isIdle])
  // oxlint-enable react/exhaustive-deps

  // Unconditional on `comparison === null` (not just `finished`) so TS keeps
  // narrowing `comparison` to non-null below — `finished` alone can't do that,
  // since it's a boolean, not a type guard on `comparison` itself.
  if (comparison === null) {
    if (save.isError) {
      return (
        <View className="flex-1 items-center justify-center px-5">
          <ErrorState onRetry={submit}>{t('onboarding.save_rankings_error')}</ErrorState>
        </View>
      )
    }
    return <Body className="px-5 pt-10 text-center">{t('onboarding.saving_rankings')}</Body>
  }

  const pick = (currentWins: boolean) => setState((s) => choose(s, currentWins))
  const toItem = (r: Restaurant) => ({
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    neighborhood: r.neighborhood?.name ?? null,
    coverImageId: r.coverImageId,
  })

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pt-5 pb-10">
      <View className="items-center">
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          style={DATA_FIGURES}
          className="font-ui-semibold text-label text-text-muted"
        >
          {t('common.n_of_total', { n: placed + 1, total })}
        </Text>
        <Serif className="mt-1.5 text-center text-serif-lg text-text">
          {t('rank.which_was_better')}
        </Serif>
      </View>

      <View className="mt-4 gap-3">
        <CompareCard item={toItem(comparison.current)} onPress={() => pick(true)} />
        <Button
          variant="secondary"
          size="sm"
          className="min-h-[40px] self-center"
          onPress={() => setState((s) => tie(s))}
        >
          {t('rank.roughly_equal')}
        </Button>
        <CompareCard item={toItem(comparison.pivot)} onPress={() => pick(false)} />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setState((s) => skip(s))}
        className="mt-5 min-h-[44px] items-center justify-center active:opacity-60"
      >
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-ui-semibold text-label text-text-muted"
        >
          {t('onboarding.havent_been_swap')}
        </Text>
      </Pressable>
    </ScrollView>
  )
}

// Step 3: friend-find, so a new profile is never friendless (the other half of
// the cold-start fix). Contact import asks permission just-in-time (App Store
// 5.1). Following is optimistic — both API calls are idempotent.
function FriendsStep({ onFinish }: { onFinish: () => void }) {
  const t = useT()
  const lift = useLift()
  const queryClient = useQueryClient()
  // Membership only, not a source of truth for the toggle itself — each row
  // owns its own `useFollow` now (optimistic + rollback + a real error
  // message), and reports back here purely so the finish button can count how
  // many are followed. The previous fire-and-forget `.catch(() => {})` meant a
  // failed follow during onboarding — the very first graph-building action in
  // the app — looked identical to a successful one.
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const [matched, setMatched] = useState<SuggestedUser[] | null>(null)
  const [contactMsg, setContactMsg] = useState<string | null>(null)

  // ['people'], not a separate key: discover.tsx's EmptyFeed hits the exact
  // same /onboarding/suggested-friends endpoint under that key — following
  // someone there only invalidated ['people'], leaving this screen's copy of
  // the same list stale (still offering someone you just followed).
  const suggested = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ users: SuggestedUser[] }>('/onboarding/suggested-friends'),
  })

  function reportFollowed(userId: string, isFollowing: boolean) {
    setFollowed((cur) => {
      const next = new Set(cur)
      if (isFollowing) next.add(userId)
      else next.delete(userId)
      return next
    })
  }

  const contactMatch = useMutation({
    mutationFn: async () => {
      const result = await importContactPhones()
      if (result.status === 'unsupported') {
        setContactMsg(t('onboarding.contacts_unsupported'))
        return
      }
      if (result.status === 'denied') {
        setContactMsg(t('onboarding.contacts_denied'))
        return
      }
      // In batches: the server takes a few thousand numbers per request, and a long address book sent
      // whole came back 400, shown as a generic "couldn't search". It normalises each number itself
      // (spaces, dashes, +1), so raw numbers are right.
      const found = new Map<string, SuggestedUser>()
      const phones = [
        ...new Set(result.phoneNumbers.map((p) => p.trim()).filter((p) => p.length <= 32)),
      ]
      for (let i = 0; i < phones.length; i += CONTACT_BATCH) {
        const { users } = await api.post<{ users: SuggestedUser[] }>('/onboarding/contacts/match', {
          phoneNumbers: phones.slice(i, i + CONTACT_BATCH),
        })
        for (const u of users) found.set(u.id, u)
      }
      const users = [...found.values()]
      setMatched(users)
      setContactMsg(
        users.length
          ? t('onboarding.contacts_found', { n: users.length })
          : t('onboarding.contacts_none_found'),
      )
    },
    onError: (err) => {
      captureError(err, 'onboarding.contactMatch')
      setContactMsg(
        err instanceof ApiError && err.status === 429
          ? t('friends.contacts_rate_limited')
          : t('onboarding.contacts_search_error'),
      )
    },
  })

  function done() {
    // Warm the graph-dependent caches before the tab shell reads them.
    queryClient.invalidateQueries({ queryKey: ['feed'] })
    onFinish()
  }

  // De-dupe if a contact match overlaps a suggestion.
  const seen = new Set<string>()
  const list = [...(matched ?? []), ...(suggested.data?.users ?? [])].filter((u) => {
    if (seen.has(u.id)) return false
    seen.add(u.id)
    return true
  })

  return (
    <View className="flex-1">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pt-6 pb-4">
        <StepTitle
          title={t('onboarding.follow_some_friends')}
          subtitle={t('onboarding.follow_subtitle')}
        />

        {contactsAvailable() && (
          <View className="mt-5">
            <Button
              variant="secondary"
              icon={<PeopleIcon size={18} />}
              disabled={contactMatch.isPending}
              onPress={() => contactMatch.mutate()}
            >
              {contactMatch.isPending ? t('rank.searching') : t('onboarding.search_contacts')}
            </Button>
          </View>
        )}
        {contactMsg && <Caption className="mt-2">{contactMsg}</Caption>}

        {suggested.isPending && <Body className="mt-4">{t('onboarding.finding_people')}</Body>}
        {/* The people, as one grouped white card with hairlines between rows. */}
        <View
          className={list.length > 0 ? 'mt-4 rounded-group bg-surface px-4' : ''}
          style={list.length > 0 ? lift : undefined}
        >
          {list.map((u, i) => (
            <PersonRow
              key={u.id}
              user={u}
              last={i === list.length - 1}
              right={
                <FollowPill
                  userId={u.id}
                  initial={false}
                  from="onboarding"
                  onChange={(v) => reportFollowed(u.id, v)}
                />
              }
            />
          ))}
        </View>
      </ScrollView>

      <View className="px-5 pb-4">
        <Button variant="primary" onPress={done}>
          {followed.size > 0
            ? t('onboarding.done_following', { n: followed.size })
            : t('onboarding.skip_for_now')}
        </Button>
      </View>
    </View>
  )
}
