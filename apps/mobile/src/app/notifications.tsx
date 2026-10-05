import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Linking, Text, View } from 'react-native'

import { Group, Row } from '@/components/SettingsRow'
import { Body, Button, Caption, Card, MAX_SCALE, Toggle } from '@/components/ui'
import { BellIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { type PushPermission, pushPermissionStatus, registerForPush } from '@/lib/push'

interface Prefs {
  social: boolean
  plans: boolean
  friends: boolean
  dishes: boolean
  events: boolean
}

// The 4 category switches (M17) + the OS-permission gate above them. Reached
// from settings/index.tsx. Permission state is re-read on every focus (not
// just on mount) — returning from the Settings app after flipping the OS
// toggle is the one moment this screen needs to notice without a manual
// refresh.
export default function NotificationSettings() {
  const t = useT()
  const queryClient = useQueryClient()
  const [permission, setPermission] = useState<PushPermission | null>(null)

  useFocusEffect(
    useCallback(() => {
      pushPermissionStatus().then(setPermission)
    }, []),
  )

  const prefs = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => api.get<Prefs>('/notifications/prefs'),
  })

  const update = useMutation({
    mutationFn: (patch: Partial<Prefs>) => api.patch<Prefs>('/notifications/prefs', patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['notification-prefs'] })
      const previous = queryClient.getQueryData<Prefs>(['notification-prefs'])
      if (previous) queryClient.setQueryData(['notification-prefs'], { ...previous, ...patch })
      return { previous }
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(['notification-prefs'], context.previous)
      // The switch flips back; say why, or it reads as a switch that does not work.
      toast({ variant: 'error', message: t('notifications.save_error') })
    },
    onSuccess: (data) => queryClient.setQueryData(['notification-prefs'], data),
  })

  async function enable() {
    const granted = await registerForPush()
    setPermission(granted ? 'granted' : await pushPermissionStatus())
  }

  const rows: { key: keyof Prefs; label: string }[] = [
    { key: 'social', label: t('notifications.social') },
    { key: 'plans', label: t('notifications.plans') },
    { key: 'friends', label: t('notifications.friends') },
    { key: 'dishes', label: t('notifications.dishes') },
    { key: 'events', label: t('notifications.events') },
  ]

  // 'unsupported' means expo-notifications isn't linked in this binary (a dev
  // client, a stale local prebuild, or — before the founder's rebuild — every
  // build). Nothing here can fix that from inside the app, so unlike denied/
  // undetermined this card has no button; and the switches below, which would
  // otherwise look live while being unable to ever deliver anything, are
  // visibly and functionally disabled rather than silently inert.
  const unsupported = permission === 'unsupported'

  return (
    <View className="flex-1 bg-bg px-4 pt-3">
      {permission === 'denied' ? (
        <Card className="mb-3 gap-3 px-4 py-4">
          <Body>{t('notifications.permission_denied')}</Body>
          <Button
            size="sm"
            variant="secondary"
            icon={<BellIcon size={16} />}
            onPress={() => Linking.openSettings()}
          >
            {t('notifications.open_settings')}
          </Button>
        </Card>
      ) : permission === 'undetermined' ? (
        <Card className="mb-3 gap-3 px-4 py-4">
          <Body>{t('notifications.permission_prompt')}</Body>
          <Button size="sm" icon={<BellIcon size={16} color="on-ink" />} onPress={enable}>
            {t('notifications.enable')}
          </Button>
        </Card>
      ) : unsupported ? (
        <Card className="mb-3 px-4 py-4">
          <Body>{t('notifications.unsupported')}</Body>
        </Card>
      ) : null}

      <View pointerEvents={unsupported ? 'none' : 'auto'}>
        <Group className={unsupported ? 'opacity-50' : ''}>
          {rows.map((row, i) => (
            <Row key={row.key} last={i === rows.length - 1}>
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="min-w-0 flex-1 font-ui text-body text-text"
              >
                {row.label}
              </Text>
              <Toggle
                checked={prefs.data?.[row.key] ?? true}
                onChange={(v) => update.mutate({ [row.key]: v })}
                label={row.label}
              />
            </Row>
          ))}
        </Group>
      </View>
      <Caption className="mt-3 px-1 text-label">{t('notifications.footer')}</Caption>
    </View>
  )
}
