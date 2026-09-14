import {
  Body,
  Button,
  Caption,
  Chip,
  EmptyState,
  ErrorState,
  RowsSkeleton,
  SectionHeader,
  SerifItalic,
  Title,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { showSheet } from '@/components/ui/Sheet'
import { CheckIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { tapSelect, tapSuccess } from '@/lib/haptics'
import { isPastPlan } from '@/lib/plans'
import { sharePlan } from '@/lib/sharePlan'
import { formatPlanDate } from '@/lib/time'
import type { PlanDetail, PlanMember, PlanReply } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

// A single plan — the RSVP/vote/confirm surface every Planes row leads to.
// `isHost`/`myReply`/`myVote` on the response already carry the viewer's own
// relationship to the plan, so no separate "am I the host" check runs here.
export default function PlanDetailScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const q = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => api.get<PlanDetail>(`/plans/${planId}`),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['plan', planId] })
    queryClient.invalidateQueries({ queryKey: ['plans'] })
    queryClient.invalidateQueries({ queryKey: ['activity'] })
  }

  const reply = useMutation({
    mutationFn: (body: { reply?: PlanReply; voteRestaurantId?: string }) =>
      api.post(`/plans/${planId}/reply`, body),
    onSuccess: (_data, body) => {
      tapSelect()
      if (body.reply) track('plan_replied', { reply: body.reply })
      if (body.voteRestaurantId) track('plan_voted')
      invalidate()
    },
    onError: (err) => {
      captureError(err, 'plans.reply')
      toast({ variant: 'error', message: 'No se pudo guardar tu respuesta.' })
    },
  })

  const confirm = useMutation({
    mutationFn: (restaurantId: string) => api.post(`/plans/${planId}/confirm`, { restaurantId }),
    onSuccess: () => {
      tapSuccess()
      track('plan_confirmed')
      invalidate()
    },
    onError: (err) => {
      captureError(err, 'plans.confirm')
      toast({ variant: 'error', message: 'No se pudo confirmar el spot.' })
    },
  })

  const cancel = useMutation({
    mutationFn: () => api.post(`/plans/${planId}/cancel`),
    onSuccess: () => {
      track('plan_cancelled')
      invalidate()
      toast({ message: 'Mesa cancelada.' })
      router.back()
    },
    onError: (err) => {
      captureError(err, 'plans.cancel')
      toast({ variant: 'error', message: 'No se pudo cancelar la mesa.' })
    },
  })

  const plan = q.data

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <RowsSkeleton rows={3} thumb={64} />
      </View>
    )
  }
  if (q.isError || !plan) {
    const forbidden = q.error instanceof ApiError && q.error.status === 403
    return (
      <View className="flex-1 bg-bg">
        {forbidden ? (
          <EmptyState>Esta mesa es solo por invitación.</EmptyState>
        ) : q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState>Esta mesa ya no existe.</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>No se pudo cargar la mesa.</ErrorState>
        )}
      </View>
    )
  }

  const chosen = plan.options.find((o) => o.id === plan.chosenRestaurantId)
  const cover = chosen ?? plan.options[0]
  const cancelled = plan.status === 'cancelled'
  const past = isPastPlan(plan)
  const canRespond = !plan.isHost && !cancelled && !past
  const voting = plan.status === 'open'

  const openConfirmSheet = async () => {
    const idx = await showSheet({
      title: 'Confirmar spot',
      options: plan.options.map((o) => ({ label: `${o.name} · ${o.votes ?? 0} votos` })),
      selectedIndex: plan.options.findIndex((o) => o.id === plan.chosenRestaurantId),
    })
    if (idx != null) confirm.mutate(plan.options[idx].id)
  }

  const openCancelConfirm = async () => {
    const idx = await showActionSheet({
      title: '¿Cancelar esta mesa?',
      message: 'Todos los invitados lo verán en su Actividad.',
      options: [{ label: 'Cancelar mesa', destructive: true }],
      cancelLabel: 'Volver',
    })
    if (idx === 0) cancel.mutate()
  }

  const groups: Record<'going' | 'maybe' | 'pending' | 'declined', PlanMember[]> = {
    going: plan.members.filter((m) => m.reply === 'going'),
    maybe: plan.members.filter((m) => m.reply === 'maybe'),
    pending: plan.members.filter((m) => m.reply === 'pending'),
    declined: plan.members.filter((m) => m.reply === 'declined'),
  }

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{ title: cancelled ? 'Mesa cancelada' : (chosen?.name ?? 'Votación abierta') }}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10"
        contentInsetAdjustmentBehavior="automatic"
      >
        <PlaceCover
          seed={cover?.id ?? plan.id}
          name={cover?.name ?? plan.host.name}
          coverImageId={cover?.coverImageId ?? null}
          size={{ w: 640, h: 480 }}
          className="mt-3 h-44 w-full"
        />
        <Title className="mt-4">{chosen ? chosen.name : 'Votación abierta'}</Title>
        <Caption className="mt-1">{formatPlanDate(plan.startsAt)}</Caption>
        <Caption className="mt-0.5">Organiza {plan.host.name}</Caption>
        {plan.note ? <SerifItalic className="mt-2 text-serif-sm">{plan.note}</SerifItalic> : null}
        {(cancelled || past) && (
          <View className="mt-3 flex-row gap-2">
            {cancelled ? (
              <Chip size="sm" state="default">
                Cancelada
              </Chip>
            ) : null}
            {past && !cancelled ? (
              <Chip size="sm" state="default">
                Ya pasó
              </Chip>
            ) : null}
          </View>
        )}

        {canRespond && (
          <View className="mt-5 flex-row gap-2">
            <Chip
              state={plan.myReply === 'going' ? 'selected' : 'default'}
              onPress={() => reply.mutate({ reply: 'going' })}
            >
              Voy
            </Chip>
            <Chip
              state={plan.myReply === 'maybe' ? 'selected' : 'default'}
              onPress={() => reply.mutate({ reply: 'maybe' })}
            >
              Tal vez
            </Chip>
            <Chip
              state={plan.myReply === 'declined' ? 'selected' : 'default'}
              onPress={() => reply.mutate({ reply: 'declined' })}
            >
              No puedo
            </Chip>
          </View>
        )}

        {plan.options.length > 1 && (
          <View>
            <SectionHeader>{voting ? 'Votación' : 'Opciones'}</SectionHeader>
            {plan.options.map((o) => {
              const mine = plan.myVote === o.id
              return (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  disabled={!voting || plan.isHost}
                  onPress={() => reply.mutate({ voteRestaurantId: o.id })}
                  className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80"
                >
                  <PlaceCover
                    seed={o.id}
                    name={o.name}
                    coverImageId={o.coverImageId}
                    size={{ w: 160, h: 160 }}
                    className="h-12 w-12"
                  />
                  <View className="min-w-0 flex-1">
                    <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                      {o.name}
                    </Text>
                    <Caption className="font-mono text-micro">
                      {o.votes ?? 0} {o.votes === 1 ? 'voto' : 'votos'}
                    </Caption>
                  </View>
                  {mine ? <CheckIcon size={16} color="accent" /> : null}
                </Pressable>
              )
            })}
            {plan.isHost && voting && (
              <Button
                className="mt-3"
                variant="secondary"
                loading={confirm.isPending}
                onPress={openConfirmSheet}
              >
                Confirmar spot
              </Button>
            )}
          </View>
        )}

        <View>
          <SectionHeader>Invitados</SectionHeader>
          {groups.going.length > 0 || plan.isHost ? (
            <MemberGroup
              label={`Van (${groups.going.length + 1})`}
              rows={[
                {
                  id: plan.host.id,
                  name: plan.host.name,
                  handle: plan.host.handle,
                  image: plan.host.image,
                  badge: 'Organiza',
                },
                ...groups.going.map((m) => ({
                  id: m.id,
                  name: m.name,
                  handle: m.handle,
                  image: m.image,
                  badge: voting ? voteBadge(m, plan.options) : undefined,
                })),
              ]}
            />
          ) : null}
          {groups.maybe.length > 0 && (
            <MemberGroup
              label={`Tal vez (${groups.maybe.length})`}
              rows={groups.maybe.map((m) => ({
                id: m.id,
                name: m.name,
                handle: m.handle,
                image: m.image,
                badge: voting ? voteBadge(m, plan.options) : undefined,
              }))}
            />
          )}
          {groups.pending.length > 0 && (
            <MemberGroup
              label={`Sin responder (${groups.pending.length})`}
              rows={groups.pending.map((m) => ({
                id: m.id,
                name: m.name,
                handle: m.handle,
                image: m.image,
              }))}
            />
          )}
          {groups.declined.length > 0 && (
            <MemberGroup
              label={`No pueden (${groups.declined.length})`}
              rows={groups.declined.map((m) => ({
                id: m.id,
                name: m.name,
                handle: m.handle,
                image: m.image,
              }))}
            />
          )}
        </View>

        <View className="mt-6 gap-3">
          <Button variant="secondary" onPress={() => sharePlan(plan)}>
            Compartir por WhatsApp
          </Button>
          {plan.isHost && !cancelled && !past ? (
            <Button
              variant="secondary"
              onPress={() => router.push(`/planes/invitar?planId=${plan.id}`)}
            >
              Invitar a más
            </Button>
          ) : null}
          {plan.isHost && !cancelled ? (
            <Pressable
              accessibilityRole="button"
              onPress={openCancelConfirm}
              className="min-h-[44px] items-center justify-center active:opacity-70"
            >
              <Text className="font-ui-medium text-label text-status-packed">Cancelar mesa</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

function voteBadge(m: PlanMember, options: PlanDetail['options']): string | undefined {
  if (!m.voteRestaurantId) return undefined
  const spot = options.find((o) => o.id === m.voteRestaurantId)
  return spot ? `votó ${spot.name}` : undefined
}

function MemberGroup({
  label,
  rows,
}: {
  label: string
  rows: { id: string; name: string; handle: string | null; image: string | null; badge?: string }[]
}) {
  return (
    <View>
      <Body className="mt-4 mb-1 font-ui-semibold text-text">{label}</Body>
      {rows.map((m) => (
        <Link key={m.id} href={`/u/${m.id}`} asChild>
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-3 border-line border-b py-2.5 active:opacity-80"
          >
            <Avatar name={m.name || m.handle || 'm'} src={m.image} size={32} />
            <Text className="flex-1 font-ui text-body text-text" numberOfLines={1}>
              {m.name || m.handle}
            </Text>
            {m.badge ? <Caption className="font-mono text-micro">{m.badge}</Caption> : null}
          </Pressable>
        </Link>
      ))}
    </View>
  )
}
