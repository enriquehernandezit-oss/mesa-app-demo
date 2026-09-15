import {
  Button,
  Caption,
  EmptyState,
  ErrorState,
  RowsSkeleton,
  SectionHeader,
} from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { isPastPlan, isPendingInvite } from '@/lib/plans'
import { formatPlanDate } from '@/lib/time'
import type { Plan, PlanReply } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Link, Stack, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

// Planes (M3): the entry point for group dinners, reached from Profile's
// "Planes" row and Activity's plan rows. Three sections, in the order a
// member should act on them — what needs a reply first, then what's already
// on the calendar, then the record of what happened.
export default function PlanesScreen() {
  const t = useT()
  const router = useRouter()
  const q = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<{ plans: Plan[] }>('/plans'),
  })

  const items = q.data?.plans ?? []
  const pending = items.filter(isPendingInvite).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const upcoming = items
    .filter((p) => !isPendingInvite(p) && p.status !== 'cancelled' && !isPastPlan(p))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const past = items
    .filter((p) => !isPendingInvite(p) && (p.status === 'cancelled' || isPastPlan(p)))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          title: t('plans.title'),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('plans.new_label')}
              onPress={() => router.push('/planes/nuevo')}
              className="min-h-[44px] justify-center active:opacity-70"
            >
              <Text className="font-mono text-eyebrow text-accent uppercase tracking-eyebrow">
                {t('plans.new_short')}
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10"
        contentInsetAdjustmentBehavior="automatic"
      >
        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('plans.load_error')}</ErrorState>
        ) : items.length === 0 ? (
          <EmptyState
            body={t('plans.empty_body')}
            action={
              <Button size="sm" variant="secondary" onPress={() => router.push('/planes/nuevo')}>
                {t('plans.new_label')}
              </Button>
            }
          >
            {t('plans.empty_title')}
          </EmptyState>
        ) : (
          <>
            {pending.length > 0 && (
              <View>
                <SectionHeader>{t('plans.section_pending')}</SectionHeader>
                {pending.map((p) => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </View>
            )}
            {upcoming.length > 0 && (
              <View>
                <SectionHeader>{t('plans.section_upcoming')}</SectionHeader>
                {upcoming.map((p) => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </View>
            )}
            {past.length > 0 && (
              <View>
                <SectionHeader>{t('plans.section_past')}</SectionHeader>
                {past.map((p) => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function replyLabel(t: ReturnType<typeof useT>, reply: PlanReply | null): string {
  if (reply === 'going') return t('plans.reply_going')
  if (reply === 'maybe') return t('plans.reply_maybe')
  if (reply === 'declined') return t('plans.reply_declined')
  return t('plans.reply_pending')
}

function PlanRow({ plan }: { plan: Plan }) {
  const t = useT()
  const chosen = plan.options.find((o) => o.id === plan.chosenRestaurantId)
  const cover = chosen ?? plan.options[0]
  const title = chosen ? chosen.name : t('plans.options_voting', { n: plan.options.length })
  const sub = plan.isHost
    ? t('plans.host_summary', { going: plan.counts.going, maybe: plan.counts.maybe })
    : t('plans.hosted_by', { name: plan.host.name })
  const badge =
    plan.status === 'cancelled'
      ? t('plans.cancelled_badge')
      : plan.isHost
        ? t('plans.hosting_badge')
        : replyLabel(t, plan.myReply)

  return (
    <Link href={`/planes/${plan.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80"
      >
        <PlaceCover
          seed={cover?.id ?? plan.id}
          name={cover?.name ?? plan.host.name}
          coverImageId={cover?.coverImageId ?? null}
          size={{ w: 160, h: 160 }}
          className="h-14 w-14"
        />
        <View className="min-w-0 flex-1">
          <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
            {title}
          </Text>
          <Caption numberOfLines={1}>{formatPlanDate(plan.startsAt)}</Caption>
          <Caption className="font-mono text-micro" numberOfLines={1}>
            {sub}
          </Caption>
        </View>
        <Caption className="font-mono text-micro uppercase tracking-micro text-accent-strong">
          {badge}
        </Caption>
      </Pressable>
    </Link>
  )
}
