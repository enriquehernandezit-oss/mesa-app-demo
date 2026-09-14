import { FollowerPicker } from '@/components/FollowerPicker'
import { Button, RowsSkeleton, Title } from '@/components/ui'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { tapSuccess } from '@/lib/haptics'
import type { PlanDetail } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Inviting more people to a plan that already exists — the host's own
// followers again, minus whoever is already invited. Shares the ['plan', id]
// query key with the detail screen so a plan opened just before landing here
// doesn't pay for a second fetch.
export default function InvitarScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>()
  const router = useRouter()
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
      toast({ message: added === 1 ? 'Invitaste a 1 persona.' : `Invitaste a ${added} personas.` })
      router.back()
    },
    onError: (err) => {
      captureError(err, 'plans.invite')
      toast({ variant: 'error', message: 'No se pudo invitar. Intenta de nuevo.' })
    },
  })

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          className="min-h-[44px] self-start justify-center active:opacity-60"
        >
          <Text className="font-ui-medium text-label text-text-muted">✕ Invitar a más</Text>
        </Pressable>
        <Title className="mt-4">Invitar a más</Title>
        <View className="mt-4">
          {plan.isPending ? (
            <RowsSkeleton />
          ) : (
            <FollowerPicker
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
      <View
        className="border-line border-t px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button
          disabled={selected.size === 0 || invite.isPending}
          loading={invite.isPending}
          onPress={() => invite.mutate()}
        >
          Invitar a {selected.size}
        </Button>
      </View>
    </View>
  )
}
