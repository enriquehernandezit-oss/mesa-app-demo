import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Group, Row } from '@/components/SettingsRow'
import { Caption, EmptyState, ErrorState, MAX_SCALE, RowsSkeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
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
    <View className="flex-1 bg-bg px-4 pt-3">
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
          <Group>
            {blocked.map((u, i) => (
              <Row key={u.id} last={i === blocked.length - 1}>
                <Avatar name={u.name || u.handle || 'm'} src={u.image} size={36} />
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="font-ui text-body text-text"
                  >
                    {u.name || (u.handle ? `@${u.handle}` : t('common.someone'))}
                  </Text>
                  {u.name && u.handle ? (
                    <Caption numberOfLines={1} className="text-meta">
                      @{u.handle}
                    </Caption>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={unblock.isPending}
                  onPress={() => unblock.mutate(u.id)}
                  className="min-h-[36px] justify-center active:opacity-60"
                >
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="font-ui-semibold text-subhead text-text"
                  >
                    {t('settings.unblock')}
                  </Text>
                </Pressable>
              </Row>
            ))}
          </Group>
        )}
      </ScrollView>
    </View>
  )
}
