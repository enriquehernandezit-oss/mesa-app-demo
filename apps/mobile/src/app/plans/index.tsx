import { useQuery } from '@tanstack/react-query'
import { Link, Stack, useRouter } from 'expo-router'
import { useMemo } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { StatusBadge } from '@/components/plans/parts'
import {
  Button,
  EmptyState,
  ErrorState,
  MAX_SCALE,
  RowsSkeleton,
  SectionHeader,
} from '@/components/ui'
import { PlusIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { api } from '@/lib/api'
import { t as translate, useLanguage, useT } from '@/lib/i18n'
import { isPastPlan, isPendingInvite } from '@/lib/plans'
import { formatPlanDate } from '@/lib/time'
import type { Plan, PlanReply } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// Plans (M3): the entry point for group dinners, reached from Profile's
// "Planes" row and Activity's plan rows. Three sections, in the order a
// member should act on them — what needs a reply first, then what's already
// on the calendar, then the record of what happened. Redesign 2: raised rows, a status badge
// at the right of each, and "New" as a solid pill in the header.
export default function PlansScreen() {
  const t = useT()
  const lang = useLanguage()
  const router = useRouter()
  const q = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<{ plans: Plan[] }>('/plans'),
  })
  // Memoized (responsiveness audit): useT()'s bound function is a new
  // identity every render, so writing this inline handed Stack.Screen a new
  // headerRight on every refetch — memoizing on `lang` instead is what
  // actually holds it stable.
  const headerOptions = useMemo(
    () => ({
      title: translate(lang, 'plans.title'),
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={translate(lang, 'plans.new_label')}
          onPress={() => router.push('/plans/new')}
          className="h-[40px] flex-row items-center gap-1.5 rounded-pill bg-ink px-4 active:opacity-80"
        >
          <PlusIcon size={15} color="on-ink" strokeWidth={2.2} />
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui-semibold text-pill text-on-ink"
          >
            {translate(lang, 'plans.new_short')}
          </Text>
        </Pressable>
      ),
    }),
    [lang, router],
  )

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
      <Stack.Screen options={headerOptions} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pb-10"
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
              <Button size="sm" variant="secondary" onPress={() => router.push('/plans/new')}>
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
                <View className="px-1">
                  <SectionHeader>{t('plans.section_pending')}</SectionHeader>
                </View>
                {pending.map((p) => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </View>
            )}
            {upcoming.length > 0 && (
              <View>
                <View className="px-1">
                  <SectionHeader>{t('plans.section_upcoming')}</SectionHeader>
                </View>
                {upcoming.map((p) => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </View>
            )}
            {past.length > 0 && (
              <View>
                <View className="px-1">
                  <SectionHeader>{t('plans.section_past')}</SectionHeader>
                </View>
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
  const lift = useLift()
  const chosen = plan.options.find((o) => o.id === plan.chosenRestaurantId)
  const cover = chosen ?? plan.options[0]
  const title = chosen ? chosen.name : t('plans.options_voting', { n: plan.options.length })
  const sub = plan.isHost
    ? t('plans.host_summary', { going: plan.counts.going, maybe: plan.counts.maybe })
    : t('plans.hosted_by', { name: plan.host.name })
  // An invite still waiting on you is the row that asks something of you.
  const pendingReply = isPendingInvite(plan)
  const badge =
    plan.status === 'cancelled'
      ? t('plans.cancelled_badge')
      : isPastPlan(plan)
        ? t('plans.past_chip')
        : plan.isHost
          ? t('plans.hosting_badge')
          : replyLabel(t, plan.myReply)

  return (
    <Link href={`/plans/${plan.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        className="mb-2 flex-row items-center gap-3 rounded-group bg-surface px-3 py-2.5 active:opacity-80"
        style={lift}
      >
        <View className="h-[56px] w-[56px] overflow-hidden rounded-[16px]">
          <PlaceCover
            name={cover?.name ?? plan.host.name}
            coverImageId={cover?.coverImageId ?? null}
            size={{ w: 168, h: 168 }}
            className="h-full w-full rounded-none"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-sm text-text"
          >
            {title}
          </Text>
          {/* The date and the who-line wrap rather than truncate: at large text sizes the badge
              takes a good share of the row. */}
          <Text maxFontSizeMultiplier={MAX_SCALE} className="mt-0.5 font-ui text-meta text-text-2">
            {formatPlanDate(plan.startsAt)}
          </Text>
          <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-micro text-text-muted">
            {sub}
          </Text>
        </View>
        <StatusBadge strong={pendingReply}>{badge}</StatusBadge>
      </Pressable>
    </Link>
  )
}
