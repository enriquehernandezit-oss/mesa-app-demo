import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FollowerPicker } from '@/components/FollowerPicker'
import { Button, RowsSkeleton } from '@/components/ui'
import { SheetHeader, SheetTitle } from '@/components/ui/SheetHeader'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { bringToTop, scrollViewHost } from '@/lib/bringToTop'
import { captureError } from '@/lib/errors'
import { tapSuccess } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { modalAlert } from '@/lib/modalAlert'
import type { PlanDetail } from '@/lib/types'

// Inviting more people to a plan that already exists — the host's own
// followers again, minus whoever is already invited. Shares the ['plan', id]
// query key with the detail screen so a plan opened just before landing here
// doesn't pay for a second fetch.
export default function InviteScreen() {
  const t = useT()
  const { planId } = useLocalSearchParams<{ planId: string }>()
  const router = useRouter()
  const scrollRef = useRef<ScrollView>(null)
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const plan = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => api.get<PlanDetail>(`/plans/${planId}`),
  })
  const exclude = useMemo(() => new Set((plan.data?.members ?? []).map((m) => m.id)), [plan.data])

  const invite = useMutation({
    mutationFn: () =>
      api.post<{ added: number }>(`/plans/${planId}/invite`, { userIds: [...selected] }),
    onSuccess: ({ added }) => {
      tapSuccess()
      queryClient.invalidateQueries({ queryKey: ['plan', planId] })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      toast({ message: t('plans.invited_count', { n: added }) })
      router.back()
    },
    onError: (err) => {
      captureError(err, 'plans.invite')
      modalAlert(t('plans.invite_error'))
    },
  })

  return (
    <View className="flex-1 bg-bg">
      <SheetHeader onClose={() => router.back()} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-6"
        // Tapping a search below slides it to the top (lib/bringToTop.ts); these let it get there.
        scrollToOverflowEnabled
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <SheetTitle>{t('plans.invite_more')}</SheetTitle>
        <View className="mt-4 px-4">
          {plan.isPending ? (
            <RowsSkeleton />
          ) : (
            <FollowerPicker
              onSearchFocus={(e) => bringToTop(scrollViewHost(scrollRef), e)}
              selected={selected}
              onToggle={(user) =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (next.has(user.id)) next.delete(user.id)
                  else next.add(user.id)
                  return next
                })
              }
              exclude={exclude}
            />
          )}
        </View>
      </ScrollView>
      <View className="px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 16) + 4 }}>
        <Button
          disabled={selected.size === 0 || invite.isPending}
          loading={invite.isPending}
          onPress={() => invite.mutate()}
        >
          {t('plans.invite_n', { n: selected.size })}
        </Button>
      </View>
    </View>
  )
}
