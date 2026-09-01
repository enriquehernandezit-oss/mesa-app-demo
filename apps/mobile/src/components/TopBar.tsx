import { Wordmark } from '@/components/ui'
import { BellIcon, SettingsIcon, ShareIcon, TrophyIcon } from '@/components/ui/icons'
import { useActivitySeen } from '@/lib/activitySeen'
import { api } from '@/lib/api'
import type { ActivityItem } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { Pressable, View } from 'react-native'
import { Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Persistent app bar over the tab shell. Discover variant: wordmark + leaderboard
// + activity bell (with an unseen badge). Profile variant: the member's name +
// share + settings. Ported from apps/app/src/components/TopBar.tsx; share wires
// up in N6.
function Btn({ children }: { children: React.ReactNode }) {
  return (
    <View className="h-[44px] w-[44px] items-center justify-center rounded-pill active:opacity-70">
      {children}
    </View>
  )
}

// The bell + its unseen badge — activity newer than the local "seen" watermark
// (advanced by the Activity screen's "Marcar leído"). The ['activity'] query is
// shared with the Activity screen, so opening it and marking read updates both.
function ActivityBell() {
  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get<{ activity: ActivityItem[] }>('/activity'),
    staleTime: 60_000,
  })
  const watermark = useActivitySeen()
  const unseen = (activity.data?.activity ?? []).filter((a) => a.at > watermark).length
  return (
    <Link href="/activity" asChild>
      <Pressable>
        <Btn>
          <BellIcon size={19} color="text" />
          {unseen > 0 && (
            <View className="absolute right-1.5 top-1.5 min-w-[16px] items-center justify-center rounded-pill bg-status-packed px-1">
              <Text className="font-mono text-[9px] text-on-accent">
                {unseen > 9 ? '9+' : unseen}
              </Text>
            </View>
          )}
        </Btn>
      </Pressable>
    </Link>
  )
}

export function TopBar({
  variant = 'discover',
  title,
}: { variant?: 'discover' | 'profile'; title?: string }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      className="flex-row items-center justify-between px-5"
      style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
    >
      {variant === 'profile' ? (
        <Text className="font-serif-semibold text-serif-md text-text">{title || 'Tú'}</Text>
      ) : (
        <Wordmark size={22} />
      )}
      <View className="flex-row gap-2">
        {variant === 'profile' ? (
          <>
            <Btn>
              <ShareIcon size={19} color="text" />
            </Btn>
            <Link href="/settings" asChild>
              <Pressable>
                <Btn>
                  <SettingsIcon size={19} color="text" />
                </Btn>
              </Pressable>
            </Link>
          </>
        ) : (
          <>
            <Link href="/leaderboard" asChild>
              <Pressable>
                <Btn>
                  <TrophyIcon size={19} color="text" />
                </Btn>
              </Pressable>
            </Link>
            <ActivityBell />
          </>
        )}
      </View>
    </View>
  )
}
