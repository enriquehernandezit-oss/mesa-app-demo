import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, Button, Caption, Chip, ErrorState, Eyebrow, Skeleton, Title } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { WebIcon } from '@/components/ui/icons'
import { UtilityPill } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { ApiError, api } from '@/lib/api'
import { eventWhenLabel } from '@/lib/display'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, View } from 'react-native'

// One Mesa-curated event's detail (M21) — reached from Explore's Eventos
// tab, the feed's "Este finde" rail, a restaurant's "Próximos eventos" rail,
// or the Activity bell's event_going entries. Never member-editable —
// there's no "edit" anywhere on this screen, by design (see docs/EVENTS.md).
export default function EventDetailScreen() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/explore'))

  const q = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => api.get<{ event: EventSummary }>(`/events/${eventId}`),
    retry: false,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    queryClient.invalidateQueries({ queryKey: ['events'] })
  }
  const setRsvp = useMutation({
    mutationFn: (status: 'going' | 'interested') => api.put(`/events/${eventId}/rsvp`, { status }),
    onSuccess: invalidate,
    onError: (err) => {
      captureError(err, 'events.rsvp')
      toast({ variant: 'error', message: t('events.rsvp_error') })
    },
  })
  const clearRsvp = useMutation({
    mutationFn: () => api.del(`/events/${eventId}/rsvp`),
    onSuccess: invalidate,
    onError: (err) => {
      captureError(err, 'events.rsvp_error')
      toast({ variant: 'error', message: t('events.rsvp_error') })
    },
  })

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="gap-3 px-5">
          <Skeleton height={180} />
          <Skeleton height={20} width={200} />
        </View>
      </View>
    )
  }
  if (q.isError || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <ErrorState onRetry={notFound ? undefined : () => q.refetch()}>
          {notFound ? t('events.not_found') : t('events.load_error')}
        </ErrorState>
      </View>
    )
  }

  const e = q.data.event
  const rsvpPending = setRsvp.isPending || clearRsvp.isPending
  // Tapping an already-active RSVP clears it — same "tap again to undo" as a
  // bookmark, rather than needing a separate "quitar" control.
  const toggle = (status: 'going' | 'interested') =>
    e.myRsvp === status ? clearRsvp.mutate() : setRsvp.mutate(status)

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10">
        <PlaceCover
          seed={e.id}
          name={e.title}
          coverImageId={e.coverImageId ?? e.restaurant.coverImageId}
          size={{ w: 700, h: 460 }}
          className="h-44 w-full rounded"
        />
        <Eyebrow className="mt-4">{eventWhenLabel(e.startsAt)}</Eyebrow>
        <Title className="mt-1">{e.title}</Title>
        <Link href={`/r/${e.restaurant.id}`} asChild>
          <Pressable className="mt-1 active:opacity-70">
            <Caption className="text-text-2">
              {[e.restaurant.name, e.restaurant.neighborhood].filter(Boolean).join(' · ')}
            </Caption>
          </Pressable>
        </Link>

        {(e.category || e.priceLabel) && (
          <View className="mt-2 flex-row flex-wrap gap-2">
            {e.category ? <Chip size="sm">{e.category}</Chip> : null}
            {e.priceLabel ? <Chip size="sm">{e.priceLabel}</Chip> : null}
          </View>
        )}

        {e.description ? <Body className="mt-3">{e.description}</Body> : null}

        <View className="mt-5 flex-row gap-2">
          <View className="flex-1">
            <Button
              variant={e.myRsvp === 'going' ? 'primary' : 'secondary'}
              onPress={() => toggle('going')}
              disabled={rsvpPending}
            >
              {e.myRsvp === 'going' ? t('events.going_confirmed') : t('events.going_cta')}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              variant={e.myRsvp === 'interested' ? 'primary' : 'secondary'}
              onPress={() => toggle('interested')}
              disabled={rsvpPending}
            >
              {e.myRsvp === 'interested'
                ? t('events.interested_confirmed')
                : t('events.interested_cta')}
            </Button>
          </View>
        </View>

        {e.friendsGoing.length > 0 && (
          <View className="mt-4">
            <Eyebrow>{t('events.friends_going_title')}</Eyebrow>
            <View className="mt-2 flex-row items-center gap-1">
              {e.friendsGoing.map((f) => (
                <Avatar key={f.id} name={f.name} src={f.image} size={24} />
              ))}
              <Caption className="ml-1">
                {t('events.friends_going_count', { n: e.goingCount })}
              </Caption>
            </View>
          </View>
        )}

        {e.ticketUrl ? (
          <View className="mt-5 flex-row gap-2">
            <UtilityPill icon={<WebIcon size={18} />} href={e.ticketUrl}>
              {t('events.buy_tickets')}
            </UtilityPill>
          </View>
        ) : null}

        <View className="mt-5">
          <Button
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/planes/nuevo',
                params: {
                  restaurantId: e.restaurant.id,
                  restaurantName: e.restaurant.name,
                  cuisine: e.restaurant.cuisine ?? '',
                  coverImageId: e.restaurant.coverImageId ?? '',
                  neighborhood: e.restaurant.neighborhood ?? '',
                  priceTier: e.restaurant.priceTier != null ? String(e.restaurant.priceTier) : '',
                  startsAt: e.startsAt,
                  note: t('events.plan_note', { title: e.title }),
                },
              })
            }
          >
            {t('events.make_a_plan')}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}
