import { Body, Button, Caption, Chip, Eyebrow, Title } from '@/components/ui'
import { CompareCard } from '@/components/ui/CompareCard'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { CheckIcon } from '@/components/ui/icons'
import { useProfile } from '@/hooks/useProfile'
import { ApiError, api } from '@/lib/api'
import { useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { contactsAvailable, importContactPhones } from '@/lib/contacts'
import { cuisineLabel } from '@/lib/display'
import { choose, initPairwise, isDone, nextComparison, progress, skip, tie } from '@/lib/pairwise'
import type { Neighborhood, Restaurant, SuggestedUser } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
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
        <Caption className="mt-2 font-mono text-[10px]">
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

  const { data } = useQuery({
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
    onSuccess: onNext,
  })

  const canSubmit = name.trim().length > 0 && handleValid && neighborhoodSlug !== '' && accepted
  const errorText =
    save.error instanceof ApiError && save.error.code === 'handle_taken'
      ? 'Ese usuario ya está en uso — prueba con otro.'
      : save.isError
        ? 'No se pudo guardar — revisa tus datos e intenta de nuevo.'
        : null

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pt-6 pb-10">
      <Title>¿Quién eres en la mesa?</Title>
      <Body className="mt-1">Así te encuentran y reconocen tus amigos en Mesa.</Body>

      <Eyebrow className="mt-6 mb-2">Nombre</Eyebrow>
      <TextInput
        className="min-h-[52px] rounded border border-line bg-surface px-4 font-ui text-body text-text"
        placeholderTextColor={placeholder}
        placeholder="Tu nombre"
        autoComplete="name"
        value={name}
        onChangeText={setName}
      />

      <Eyebrow className="mt-5 mb-2">Instagram · opcional</Eyebrow>
      <TextInput
        className="min-h-[52px] rounded border border-line bg-surface px-4 font-ui text-body text-text"
        placeholderTextColor={placeholder}
        placeholder="@tuusuario"
        autoCapitalize="none"
        autoCorrect={false}
        value={handle}
        onChangeText={(v) => setHandle(v.replace(/[^a-zA-Z0-9_.@]/g, ''))}
      />
      {handle.length > 0 && !handleValid && (
        <Caption className="mt-1 text-status-packed">
          2–30 caracteres: letras, números, _ o .
        </Caption>
      )}

      <Eyebrow className="mt-5 mb-2">Sector</Eyebrow>
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
  const { data, isPending } = useQuery({
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
      saving={save.isPending}
      onComplete={(ordered) => save.mutate(ordered.map((r) => r.id))}
    />
  )
}

function ComparePhase({
  restaurants,
  saving,
  onComplete,
}: {
  restaurants: Restaurant[]
  saving: boolean
  onComplete: (ordered: Restaurant[]) => void
}) {
  const [state, setState] = useState(() => initPairwise(restaurants))
  const comparison = nextComparison(state)
  const { placed, total } = progress(state)

  // No comparison left: the list is fully ordered. Persist it once.
  if (comparison === null) {
    if (isDone(state) && !saving) onComplete(state.ordered)
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
      <Text className="font-mono text-[11px] text-text-muted">
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
          <Text className="font-mono text-[11px] text-text-muted uppercase tracking-eyebrow">
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
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [matched, setMatched] = useState<SuggestedUser[] | null>(null)
  const [contactMsg, setContactMsg] = useState<string | null>(null)

  const suggested = useQuery({
    queryKey: ['onboarding', 'suggested-friends'],
    queryFn: () => api.get<{ users: SuggestedUser[] }>('/onboarding/suggested-friends'),
  })

  function toggleFollow(userId: string) {
    setFollowing((cur) => {
      const next = new Set(cur)
      if (next.has(userId)) {
        next.delete(userId)
        void api.del(`/social/follow/${userId}`).catch(() => {})
      } else {
        next.add(userId)
        void api.post('/social/follow', { userId }).catch(() => {})
      }
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
          {list.map((u) => {
            const on = following.has(u.id)
            return (
              <View key={u.id} className="flex-row items-center gap-3 border-line border-b py-3">
                <View className="min-w-0 flex-1">
                  <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                    {u.name || u.handle}
                  </Text>
                  <Caption numberOfLines={1}>
                    {[u.handle ? `@${u.handle}` : null, u.neighborhood].filter(Boolean).join(' · ')}
                  </Caption>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => toggleFollow(u.id)}
                  className={`min-h-[36px] justify-center rounded-pill border px-4 ${on ? 'border-accent bg-accent-fill' : 'border-line'} active:opacity-70`}
                >
                  <Text
                    className={`font-mono text-[11px] ${on ? 'text-accent-strong' : 'text-text-muted'}`}
                  >
                    {on ? 'Siguiendo' : 'Seguir'}
                  </Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      </ScrollView>

      <View className="px-5 pb-4">
        <Button variant="primary" onPress={done}>
          {following.size > 0 ? `Listo — siguiendo a ${following.size}` : 'Omitir por ahora'}
        </Button>
      </View>
    </View>
  )
}
