import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { CloseIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'

// The repeat-dish nudge (M20) — shown on the rank reveal (right after
// posting the dish that crossed the trigger) and on the standalone composer.
// Both `kind`s land here through the exact same card; the only difference is
// copy, driven by `count` (always present for 'first', since it's the very
// count that just crossed 3 — 'insert' doesn't need it, the list is already
// ranked and this is just "one more got added"). Redesign 2: an inverted ink card — the serif
// line, a quieter sentence under it, and a "Rank" pill in the ground colour.
export function DishNudgeCard({
  label,
  listId,
  count,
  onDismiss,
}: {
  label: string
  listId: string
  count?: number
  onDismiss?: () => void
}) {
  const t = useT()
  const router = useRouter()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/dish-lists/rank?listId=${listId}`)}
      className="mt-4 flex-row items-center gap-3 rounded-group bg-ink px-4 py-3.5 active:opacity-90"
    >
      <View className="min-w-0 flex-1">
        <Text maxFontSizeMultiplier={MAX_SCALE} className="font-serif text-serif-md text-on-ink">
          {count != null
            ? t('dishLists.nudge_title_first', { label, n: count })
            : t('dishLists.nudge_title_insert', { label })}
        </Text>
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="mt-1 font-ui text-label text-on-ink opacity-70"
        >
          {t('dishLists.nudge_body')}
        </Text>
      </View>
      <View className="min-h-[34px] items-center justify-center rounded-pill bg-bg px-3.5">
        <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-label text-text">
          {t('dishLists.rank_button')}
        </Text>
      </View>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('dishLists.dismiss')}
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="min-h-[32px] min-w-[24px] items-center justify-center"
        >
          <CloseIcon size={14} color="on-ink" />
        </Pressable>
      ) : null}
    </Pressable>
  )
}
