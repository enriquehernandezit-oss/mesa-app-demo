import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, ErrorState, Skeleton, Title } from '@/components/ui'
import { CompareCard, type CompareCardItem } from '@/components/ui/CompareCard'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { tapSelect } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import {
  type PairwiseState,
  choose,
  comparisonsLeft,
  initInsertMany,
  isDone,
  nextComparison,
  tie,
} from '@/lib/pairwise'
import type { DishListDetail, DishListEntry } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

// The dish-ranking pairwise flow (M20) — reached from a DishNudgeCard tap or
// from a "Rankear más" CTA on app/platos/[listId].tsx. Both a first ranking
// (existing = [], unranked = 3+) and a later insert (existing = the ranked
// order, unranked = whatever's accumulated since) go through the exact same
// initInsertMany call — see that function's own header for why one call
// handles both.
type Item = CompareCardItem & { sentiment: DishListEntry['dish']['sentiment'] }

function toItem(entry: DishListEntry): Item {
  return {
    id: entry.restaurant.id,
    name: entry.restaurant.name,
    cuisine: entry.restaurant.cuisine,
    neighborhood: entry.restaurant.neighborhood,
    coverImageId: entry.dish.imageId ?? entry.restaurant.coverImageId,
    priceTier: entry.restaurant.priceTier,
    sentiment: entry.dish.sentiment,
  }
}

export default function RankearScreen() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { listId } = useLocalSearchParams<{ listId: string }>()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/platos'))

  const q = useQuery({
    queryKey: ['dish-list', listId],
    queryFn: () => api.get<DishListDetail>(`/dish-lists/${listId}`),
    retry: false,
  })

  const save = useMutation({
    mutationFn: (restaurantIds: string[]) =>
      api.put(`/dish-lists/${listId}/order`, { restaurantIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dish-list', listId] })
      queryClient.invalidateQueries({ queryKey: ['dish-lists'] })
      router.replace(`/platos/${listId}`)
    },
    onError: (err) => {
      captureError(err, 'platos.saveOrder')
      // A root toast is fine as a passive signal, but the real recovery
      // affordance is the inline retry on the "done" screen below — this
      // route registers as a modal (see _layout.tsx), and rank.tsx's own
      // M12 header already established that root toasts read as hidden
      // behind a presented modal.
      toast({ variant: 'error', message: t('platos.save_error') })
    },
  })
  // `.variables` is TanStack's own record of the args the last mutate() call
  // used — replaying it on retry means the member never has to redo a single
  // comparison just because the PUT failed.
  const retry = () => save.mutate(save.variables as string[])

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="gap-3 px-5">
          <Skeleton height={140} />
          <Skeleton height={44} />
          <Skeleton height={140} />
        </View>
      </View>
    )
  }
  if (q.isError || !q.data) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <ErrorState onRetry={() => q.refetch()}>{t('platos.load_error')}</ErrorState>
      </View>
    )
  }

  const { label, ranked, unranked } = q.data
  if (unranked.length === 0) {
    // Nothing left to place — a manual re-visit after already finishing (or
    // a second tap on a since-completed nudge). Nothing to do but go look.
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="items-center px-5 pt-10">
          <Body className="text-center">{t('platos.nothing_to_rank')}</Body>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace(`/platos/${listId}`)}
            className="mt-4 min-h-[44px] justify-center active:opacity-70"
          >
            <Text className="font-ui-semibold text-eyebrow text-accent uppercase tracking-eyebrow">
              {t('platos.view_list')}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <PairwiseFlow
      label={label}
      existing={[...ranked].sort((a, b) => a.position - b.position).map(toItem)}
      newItems={unranked.map(toItem)}
      onDone={(orderedIds) => save.mutate(orderedIds)}
      saveError={save.isError}
      onRetry={retry}
      onBack={goBack}
    />
  )
}

function PairwiseFlow({
  label,
  existing,
  newItems,
  onDone,
  saveError,
  onRetry,
  onBack,
}: {
  label: string
  existing: Item[]
  newItems: Item[]
  onDone: (orderedRestaurantIds: string[]) => void
  saveError: boolean
  onRetry: () => void
  onBack: () => void
}) {
  const t = useT()
  // Seeded once per (listId's) data arrival — existing/newItems are stable
  // across re-renders of this component since they come from one query.
  const initial = useMemo(() => initInsertMany(existing, newItems), [existing, newItems])
  const [state, setState] = useState<PairwiseState<Item>>(initial)
  const [answered, setAnswered] = useState(0)
  const comparison = nextComparison(state)
  const done = comparison === null && isDone(state)

  // A ref-free "call once" guard would need one anyway since `state` is
  // stable once done (no further choose()/tie() calls change it) — the
  // effect's own dependency array already gives us that: it only re-fires if
  // `state.ordered` itself changes identity, which it doesn't once settled.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot on `done`; onDone (save.mutate) is stable enough not to need retriggering this.
  useEffect(() => {
    if (!done) return
    onDone(state.ordered.map((i) => i.id))
  }, [done, state.ordered])

  if (done) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-5">
        <Text style={DATA_FIGURES} className="font-serif text-display text-accent">
          ✓
        </Text>
        {saveError ? (
          <>
            <Body className="mt-2 text-status-packed">{t('platos.save_error')}</Body>
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              className="mt-3 min-h-[44px] justify-center active:opacity-70"
            >
              <Text className="font-ui-semibold text-eyebrow text-accent uppercase tracking-eyebrow">
                {t('common.retry')}
              </Text>
            </Pressable>
          </>
        ) : (
          <Body className="mt-2">{t('common.saving')}</Body>
        )}
      </View>
    )
  }

  if (comparison === null) {
    return <Body className="mt-6 px-5">{t('rank.placing')}</Body>
  }

  const step = answered + 1
  const total = answered + comparisonsLeft(state)
  const pivotPos = state.ordered.findIndex((x) => x.id === comparison.pivot.id) + 1

  function sentimentLabel(sentiment: Item['sentiment']): string | null {
    if (sentiment === 'loved') return t('rank.sentiment_loved')
    if (sentiment === 'fine') return t('rank.sentiment_fine')
    if (sentiment === 'disliked') return t('rank.sentiment_disliked')
    return null
  }

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={onBack} backLabel={t('common.back_plain')} />
      <View className="mt-2 gap-4 px-5">
        <Text style={DATA_FIGURES} className="font-ui-medium text-eyebrow text-text-muted">
          {step} de {total}
        </Text>
        <View className="items-center gap-1">
          <Title>{t('platos.compare_title', { label })}</Title>
        </View>
        <View className="gap-3">
          <CompareCard
            item={comparison.current}
            subline={sentimentLabel(comparison.current.sentiment)}
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
            subline={
              sentimentLabel(comparison.pivot.sentiment) ??
              t('rank.position_on_list', { position: pivotPos })
            }
            onPress={() => {
              tapSelect()
              setAnswered((a) => a + 1)
              setState((s) => choose(s, false))
            }}
          />
        </View>
      </View>
    </View>
  )
}
