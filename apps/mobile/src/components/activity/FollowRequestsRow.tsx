import { type Href, useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

import { Caption, MAX_SCALE } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { ChevronIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'
import type { FollowRequest } from '@/lib/types'

// "Follow requests", pinned at the top of Activity while anyone is waiting on a private account
// (F1): the newest asker's face with a burgundy count, who is asking, and a chevron into the
// list where each one is confirmed or deleted. Not a notification row — it goes away the moment
// the last request is answered.
export function FollowRequestsRow({
  requests,
  count,
}: {
  requests: FollowRequest[]
  count: number
}) {
  const t = useT()
  const router = useRouter()
  const first = requests[0]
  if (!first) return null
  const name = first.name || first.handle || t('activity.someone')
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/follow-requests' as Href)}
      className="mt-2 flex-row items-center gap-3 border-line border-b py-3 active:opacity-80"
    >
      <View>
        <Avatar name={name} src={first.image} size={40} />
        {count > 1 ? (
          <View className="absolute -right-1 -top-1 h-[20px] min-w-[20px] items-center justify-center rounded-pill bg-accent-fill px-1">
            <Text className="font-ui-semibold text-eyebrow text-on-accent">{count}</Text>
          </View>
        ) : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-ui-semibold text-subhead leading-[21px] text-text"
        >
          {t('requests.title')}
        </Text>
        <Caption numberOfLines={1} className="text-meta">
          {count > 1
            ? t('requests.row_many', { name, n: count - 1 })
            : t('requests.row_single', { name })}
        </Caption>
      </View>
      <ChevronIcon size={16} color="text-muted" />
    </Pressable>
  )
}
