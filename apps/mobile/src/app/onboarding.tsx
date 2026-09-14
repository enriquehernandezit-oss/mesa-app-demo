import { FollowPill, PersonRow } from '@/components/PersonRow'
import { Body, Button, Caption, Chip, ErrorState, Eyebrow, Title } from '@/components/ui'
import { CompareCard } from '@/components/ui/CompareCard'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { CheckIcon } from '@/components/ui/icons'
import { useProfile } from '@/hooks/useProfile'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { contactsAvailable, importContactPhones } from '@/lib/contacts'
import { cuisineLabel } from '@/lib/display'
import { captureError } from '@/lib/errors'
import { tapSuccess } from '@/lib/haptics'
import { choose, initPairwise, isDone, nextComparison, progress, skip, tie } from '@/lib/pairwise'
import { takePendingInvite } from '@/lib/pendingInvite'
import type { Neighborhood, Restaurant, SuggestedUser } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Cold-start fix — the #1 product risk is an empty first open, so onboarding is
// first-class. A new profile leaves this flow with an identity, a starter
// ranking, and at least a few friends: never empty, never friendless. Ported
// from apps/app/src/screens/Onboarding.tsx + its three step files.
//
// The flow owns its own step state and does NOT invalidate ['me'] between steps.
// If it did, the moment the ranking step wrote its rows the gate would see
// onboardingComplete flip true and yank the member into the tab shell before
// friend-find. We refresh ['me'] exactly once, at the end.
const STEPS = ['profile', 'rank', 'friends'] as const
type Step = (typeof STEPS)[number]

export default function Onboarding() {
  const authLost = useAuthLost()
  const { data: session, isPending } = useSession()
  const authed = Boolean(session?.user)
  const { data: me } = useProfile(authed && !authLost)
  const [step, setStep] = useState<Step>('profile')
  const queryClient = useQueryClient()
  const router = useRouter()

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

  const stepIndex = STEPS.indexOf(step)

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 pt-2">
        <View className="h-1 overflow-hidden rounded-pill bg-bg-sunk">
          <View
            className="h-1 rounded-pill bg-accent-fill"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </View>
        <Caption className="mt-2 font-mono text-micro">
          Paso {stepIndex + 1} de {STEPS.length} · arma tu lista inicial
        </Caption>
      </View>

      {step === 'profile' && <ProfileStep onNext={() => setStep('rank')} />}
      {step === 'rank' && <RankStep onNext={() => setStep('friends')} />}
      {step === 'friends' && <FriendsStep onFinish={finish} />}
    </SafeAreaView>
  )
}

// Step 1: identity. Name, @handle, home sector, and the EULA/terms accept a UGC
// app needs at signup (App Store 1.2).
function ProfileStep({ onNext }: { onNext: () => void }) {
  const placeholder = useColor('text-muted')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [neighborhoodSlug, setNeighborhood] = useState('')
  const [accepted, setAccepted] = useState(false)

  const {
    data,
    isError: neighborhoodsError,
    refetch: refetchNeighborhoods,
  } = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  // Instagram username — optional, stored without the "@" (it's a display
  // prefix). Blank simply omits it; the handle stays null.
  const igUser = handle.trim().replace(/@/g, '').toLowerCase()
  const handleProvided = igUser.length > 0
  const handleValid = !handleProvided || /^[a-z0-9_.]{2,30}$/.test(igUser)

  const save = useMutation({
    mutationFn: () =>
      api.patch('/me/profile', {
        name: name.trim(),
        ...(handleProvided ? { handle: igUser } : {}),
        neighborhoodSlug,
        acceptEula: true,
      }),
    onSuccess: () => {
      tapSuccess()
      onNext()
    },
  })

  const canSubmit = name.trim().length > 0 && handleValid && neighborhoodSlug !== '' && accepted
  const errorText =
    save.error instanceof ApiError && save.error.code === 'handle_taken'
      ? 'Ese usuario ya está en uso — prueba con otro.'
      : save.isError
        ? 'No se pudo guardar — revisa tus datos e intenta de nuevo.'
        : null

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-5 pt-6 pb-10"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <Title>¿Quién eres en la mesa?</Title>
      <Body className="mt-1">Así te encuentran y reconocen tus amigos en Mesa.</Body>

      <Eyebrow className="mt-6 mb-2">Nombre</Eyebrow>
      <TextInput
        className="min-h-[52px] rounded border border-line bg-surface px-4 font-ui text-body text-text"
        placeholderTextColor={placeholder}
        placeholder="Tu nombre"
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={setName}
      />

      <Eyebrow className="mt-5 mb-2">@usuario · opcional</Eyebrow>
      <TextInput
        className="min-h-[52px] rounded border border-line bg-surface px-4 font-ui text-body text-text"
        placeholderTextColor={placeholder}
        placeholder="@tuusuario"
        autoCapitalize="none"
        autoCorrect={false}
        value={handle}
        onChangeText={(v) => setHandle(v.replace(/[^a-zA-Z0-9_.@]/g, ''))}
      />
      {/* This is what people tap "Compartir perfil" against later — skipping
          it silently breaks that share link, so the helper line says so up
          front instead of leaving it read as a pure Instagram field. */}
      <Caption className="mt-1">Sirve para compartir tu perfil. Puede ser tu Instagram.</Caption>
      {handle.length > 0 && !handleValid && (
        <Caption className="mt-1 text-status-packed">
          2–30 caracteres: letras, números, _ o .
        </Caption>
      )}

      <Eyebrow className="mt-5 mb-2">Sector</Eyebrow>
      {neighborhoodsError ? (
        <ErrorState onRetry={() => refetchNeighborhoods()}>
          No se pudieron cargar los sectores.
        </ErrorState>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {data?.neighborhoods.map((n) => (
            <Chip
              key={n.slug}
              size="sm"
              state={neighborhoodSlug === n.slug ? 'selected' : 'default'}
              onPress={() => setNeighborhood(n.slug)}
            >
              {n.name}
            </Chip>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        onPress={() => setAccepted((v) => !v)}
        className="mt-6 min-h-[44px] flex-row items-start gap-3 active:opacity-70"
      >
        <View
          className={`h-6 w-6 items-center justify-center rounded border ${accepted ? 'border-accent bg-accent-fill' : 'border-line'}`}
        >
          {accepted && <CheckIcon size={14} color="accent-strong" />}
        </View>
        <Caption className="flex-1">
          Acepto los Términos y el EULA de Mesa, y entiendo que el contenido inapropiado y los
          usuarios abusivos pueden ser reportados, bloqueados y eliminados.
        </Caption>
      </Pressable>

      {errorText && <Caption className="mt-3 text-status-packed">{errorText}</Caption>}

      <View className="mt-6">
        <Button
          variant="primary"
          disabled={!canSubmit || save.isPending}
          onPress={() => save.mutate()}
        >
          {save.isPending ? 'Guardando…' : 'Continuar'}
        </Button>
      </View>
    </ScrollView>
  )
}

// Step 2: the atomic mechanic. First pick the spots you've actually been to (you
// can't rank a place you haven't visited), then place them with a few pairwise
// comparisons. The settled order becomes the starter ranking. No stars, anywhere.
const MIN_TO_RANK = 3
const MAX_TO_RANK = 8

function RankStep({ onNext }: { onNext: () => void }) {
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

  if (isPending) return <Body className="px-5 pt-8">Cargando spots…</Body>
  if (isError) {
    return (
      <View className="flex-1 items-center justify-center px-5">
        <ErrorState onRetry={() => refetch()}>No se pudieron cargar los spots.</ErrorState>
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
          <Title>¿A cuáles de estos has ido?</Title>
          <Body className="mt-1">
            Elige {MIN_TO_RANK}–{MAX_TO_RANK}. Después los pondrás en orden.
          </Body>
          <View className="mt-4 flex-row flex-wrap justify-between gap-y-4">
            {data?.restaurants.map((r) => {
              const on = selectedIds.includes(r.id)
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => toggle(r.id)}
                  className={`w-[48%] overflow-hidden rounded border ${on ? 'border-accent' : 'border-line'} active:opacity-80`}
                >
                  <View className="h-24">
                    <PlaceCover
                      seed={r.id}
                      name={r.name}
                      coverImageId={r.coverImageId}
                      size={{ w: 400, h: 300 }}
                      className="h-full w-full"
                    />
                    {on && (
                      <View className="absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-pill bg-accent">
                        <CheckIcon size={13} color="on-accent" />
                      </View>
                    )}
                  </View>
                  <View className="p-2">
                    <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Caption numberOfLines={1}>
                      {[cuisineLabel(r.cuisine), r.neighborhood?.name].filter(Boolean).join(' · ')}
                    </Caption>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </ScrollView>
        <View className="px-5 pb-4">
          <Button
            variant="primary"
            disabled={selectedIds.length < MIN_TO_RANK}
            onPress={() => setPhase('compare')}
          >
            {selectedIds.length < MIN_TO_RANK
              ? `Elige ${MIN_TO_RANK - selectedIds.length} más`
              : `Rankear estos ${selectedIds.length}`}
          </Button>
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
  useEffect(() => {
    if (finished && save.isIdle) submit()
  }, [finished, save.isIdle])

  // Unconditional on `comparison === null` (not just `finished`) so TS keeps
  // narrowing `comparison` to non-null below — `finished` alone can't do that,
  // since it's a boolean, not a type guard on `comparison` itself.
  if (comparison === null) {
    if (save.isError) {
      return (
        <View className="flex-1 items-center justify-center px-5">
          <ErrorState onRetry={submit}>No se pudieron guardar tus rankings.</ErrorState>
        </View>
      )
    }
    return <Body className="px-5 pt-10 text-center">Guardando tus rankings…</Body>
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
      <Text className="font-mono text-eyebrow text-text-muted">
        {placed + 1} de {total}
      </Text>
      <Title className="mt-1 text-center">¿Cuál estuvo mejor?</Title>

      <View className="mt-4 gap-3">
        <CompareCard item={toItem(comparison.current)} onPress={() => pick(true)} />
        <Pressable
          accessibilityRole="button"
          onPress={() => setState((s) => tie(s))}
          className="min-h-[44px] items-center justify-center rounded-pill border border-line active:opacity-70"
        >
          <Text className="font-mono text-eyebrow text-text-muted uppercase tracking-eyebrow">
            Más o menos igual
          </Text>
        </Pressable>
        <CompareCard item={toItem(comparison.pivot)} onPress={() => pick(false)} />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setState((s) => skip(s))}
        className="mt-5 min-h-[44px] items-center justify-center active:opacity-60"
      >
        <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
          ¿No has ido a uno? Cámbialo
        </Text>
      </Pressable>
    </ScrollView>
  )
}

// Step 3: friend-find, so a new profile is never friendless (the other half of
// the cold-start fix). Contact import asks permission just-in-time (App Store
// 5.1). Following is optimistic — both API calls are idempotent.
function FriendsStep({ onFinish }: { onFinish: () => void }) {
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
        setContactMsg('Importar contactos funciona en la app del teléfono.')
        return
      }
      if (result.status === 'denied') {
        setContactMsg('No hay problema — puedes agregar amigos cuando quieras desde tu perfil.')
        return
      }
      const { users } = await api.post<{ users: SuggestedUser[] }>('/onboarding/contacts/match', {
        phoneNumbers: result.phoneNumbers,
      })
      setMatched(users)
      setContactMsg(
        users.length
          ? `${users.length} contactos están en Mesa.`
          : 'Todavía no hay contactos en Mesa.',
      )
    },
    onError: (err) => {
      captureError(err, 'onboarding.contactMatch')
      setContactMsg('No se pudo buscar en tus contactos. Intenta de nuevo.')
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
        <Title>Sigue a algunos amigos</Title>
        <Body className="mt-1">Sus rankings llenan tu feed. Ese es el punto de Mesa.</Body>

        {contactsAvailable() && (
          <View className="mt-4">
            <Button
              variant="secondary"
              disabled={contactMatch.isPending}
              onPress={() => contactMatch.mutate()}
            >
              {contactMatch.isPending ? 'Buscando…' : 'Buscar amigos en tus contactos'}
            </Button>
          </View>
        )}
        {contactMsg && <Caption className="mt-2">{contactMsg}</Caption>}

        <View className="mt-4">
          {suggested.isPending && <Body>Buscando gente…</Body>}
          {list.map((u) => (
            <PersonRow
              key={u.id}
              user={u}
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
          {followed.size > 0 ? `Listo — siguiendo a ${followed.size}` : 'Omitir por ahora'}
        </Button>
      </View>
    </View>
  )
}
