import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Row } from '@/components/SettingsRow'
import { EmptyState, ErrorState, RowsSkeleton } from '@/components/ui'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { BlockedUser } from '@/lib/types'

// Cuentas bloqueadas (M15) — its own screen now (was a conditionally-shown
// section on the old flat app/settings.tsx, hidden entirely on a fetch
// error rather than showing one — see the isError branch below).
export default function BlockedAccounts() {
  const t = useT()
  const queryClient = useQueryClient()
  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ blocked: BlockedUser[] }>('/moderation/blocks'),
  })
  const unblock = useMutation({
    mutationFn: (userId: string) => api.del(`/moderation/blocks/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocks'] }),
    onError: () => toast({ variant: 'error', message: t('settings.unblock_error') }),
  })
  const blocked = blocks.data?.blocked ?? []

  return (
    <View className="flex-1 bg-bg px-5 pt-4">
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        {blocks.isPending ? (
          <RowsSkeleton rows={4} />
        ) : blocks.isError ? (
          <ErrorState onRetry={() => blocks.refetch()}>
            {t('settings.blocked_load_error')}
          </ErrorState>
        ) : blocked.length === 0 ? (
          <EmptyState>{t('settings.no_blocked_accounts')}</EmptyState>
        ) : (
          <View className="rounded border border-line bg-surface px-4">
            {blocked.map((u, i) => (
              <Row key={u.id} last={i === blocked.length - 1}>
                <Text className="flex-1 font-ui text-body text-text">
                  {u.name || (u.handle ? `@${u.handle}` : t('common.someone'))}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={unblock.isPending}
                  onPress={() => unblock.mutate(u.id)}
                  className="min-h-[36px] justify-center active:opacity-60"
                >
                  <Text className="font-ui-medium text-label text-accent-strong">
                    {t('settings.unblock')}
                  </Text>
                </Pressable>
              </Row>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
