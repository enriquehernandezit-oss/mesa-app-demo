import { useMutation } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FollowerPicker } from '@/components/FollowerPicker'
import { Button, Caption } from '@/components/ui'
import { SheetHeader, SheetTitle } from '@/components/ui/SheetHeader'
import { toast } from '@/components/ui/toast-store'
import { ApiError, api } from '@/lib/api'
import { bringToTop, scrollViewHost } from '@/lib/bringToTop'
import { captureError } from '@/lib/errors'
import { tapSuccess } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { modalAlert } from '@/lib/modalAlert'

// Sending an event to people in Mesa: pick from your followers (the same people a plan can
// invite), and each gets it in their bell and as a push that opens the event — the in-app
// counterpart of sharing the text to WhatsApp.
export default function SendEvent() {
  const t = useT()
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const router = useRouter()
  const scrollRef = useRef<ScrollView>(null)
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const send = useMutation({
    mutationFn: () =>
      api.post<{ sent: number }>(`/events/${eventId}/share`, { userIds: [...selected] }),
    onSuccess: ({ sent }) => {
      tapSuccess()
      toast({ message: t('events.sent_count', { n: sent }) })
      router.back()
    },
    onError: (err) => {
      if (!(err instanceof ApiError && err.status === 429)) captureError(err, 'events.send')
      modalAlert(t('events.send_error'))
    },
  })

  return (
    <View className="flex-1 bg-bg">
      <SheetHeader onClose={() => router.back()} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-6"
        // Tapping the search slides it to the top (lib/bringToTop.ts); these let it get there.
        scrollToOverflowEnabled
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <SheetTitle>{t('events.send_title')}</SheetTitle>
        <Caption className="mt-2 px-5 text-pill">{t('events.send_hint')}</Caption>
        <View className="mt-4 px-4">
          <FollowerPicker
            pick="send"
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
          />
        </View>
      </ScrollView>
      <View className="px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 16) + 4 }}>
        <Button
          disabled={selected.size === 0 || send.isPending}
          loading={send.isPending}
          onPress={() => send.mutate()}
        >
          {t('events.send_n', { n: selected.size })}
        </Button>
      </View>
    </View>
  )
}
