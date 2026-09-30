import { useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { FollowPill } from '@/components/PersonRow'
import { Caption, MAX_SCALE, SectionHeader } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { useT } from '@/lib/i18n'
import { reasonLine } from '@/lib/suggestionReason'
import type { FriendSuggestion } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// "People you may know": a shelf of person tiles between friend cards. Each says why
// they're here — followed by someone you follow, a taste match, or just popular. The face,
// the name and the reason open the person's profile — look before you follow — and the pill
// under them follows.
export function PeopleShelf({ people }: { people: FriendSuggestion[] }) {
  const t = useT()
  const router = useRouter()
  const lift = useLift()
  return (
    <View className="mb-2 mt-1">
      <View className="px-5">
        <SectionHeader
          action={
            <Text
              accessibilityRole="button"
              onPress={() => router.push('/friends')}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-medium text-pill text-text-muted"
            >
              {t('feed.see_all')}
            </Text>
          }
        >
          {t('feed.people_you_may_know')}
        </SectionHeader>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2.5 px-4 pb-3"
      >
        {people.map((u) => (
          <View
            key={u.id}
            className="w-[138px] items-center gap-1.5 rounded-card bg-surface px-3 pb-3 pt-4"
            style={lift}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={u.name || u.handle || undefined}
              onPress={() => router.push(`/u/${u.id}`)}
              className="w-full items-center gap-1.5 active:opacity-80"
            >
              <Avatar name={u.name || u.handle || 'm'} src={u.image} size={56} />
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_SCALE}
                className="mt-1 font-serif text-serif-sm text-text"
              >
                {u.name || u.handle}
              </Text>
              <Caption numberOfLines={2} className="h-[30px] text-center text-micro">
                {reasonLine(t, u.reason)}
              </Caption>
            </Pressable>
            <FollowPill userId={u.id} initial={false} from="feed_shelf" />
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
