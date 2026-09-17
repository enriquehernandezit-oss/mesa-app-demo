import { Caption } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

// The repeat-dish nudge (M20) — shown on the rank reveal (right after
// posting the dish that crossed the trigger) and on the standalone composer.
// Both `kind`s land here through the exact same card; the only difference is
// copy, driven by `count` (always present for 'first', since it's the very
// count that just crossed 3 — 'insert' doesn't need it, the list is already
// ranked and this is just "one more got added").
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
      onPress={() => router.push(`/platos/rankear?listId=${listId}`)}
      className="mt-4 flex-row items-start gap-3 rounded border border-accent bg-surface px-4 py-3 active:opacity-90"
    >
      <View className="flex-1">
        <Text className="font-serif text-serif-md text-text">
          {count != null
            ? t('platos.nudge_title_first', { label, n: count })
            : t('platos.nudge_title_insert', { label })}
        </Text>
        <Caption className="mt-1">{t('platos.nudge_body')}</Caption>
      </View>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('platos.dismiss')}
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="min-h-[32px] min-w-[32px] items-center justify-center"
        >
          <Text className="font-ui text-body text-text-muted">✕</Text>
        </Pressable>
      ) : null}
    </Pressable>
  )
}
