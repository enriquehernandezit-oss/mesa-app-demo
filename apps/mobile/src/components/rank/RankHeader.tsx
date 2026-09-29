import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton, MAX_SCALE } from '@/components/ui'
import { BackIcon, CloseIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'

// The top row of the rank flow's steps: a round Back chip on the left, a small centred line
// ("1 of 6"), and on the right either a Close chip or whatever the step puts there ("Done").
// It carries the top safe-area inset itself, so every step starts at the same height.
export function RankHeader({
  onBack,
  onClose,
  center,
  right,
}: {
  onBack?: () => void
  onClose?: () => void
  center?: string
  right?: ReactNode
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: Math.max(insets.top, 12) + 8 }}>
      <View className="h-[42px] flex-row items-center justify-between px-4">
        {onBack ? (
          <IconButton
            accessibilityLabel={t('common.back_plain')}
            onPress={onBack}
            icon={<BackIcon size={18} color="text" />}
          />
        ) : (
          <View className="h-[42px] w-[42px]" />
        )}
        {center ? (
          <View pointerEvents="none" className="absolute inset-x-0 items-center">
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-label text-text-muted"
            >
              {center}
            </Text>
          </View>
        ) : null}
        {onClose ? (
          <IconButton
            accessibilityLabel={t('rank.feel_close')}
            onPress={onClose}
            icon={<CloseIcon size={18} color="text" />}
          />
        ) : (
          (right ?? <View className="h-[42px] w-[42px]" />)
        )}
      </View>
    </View>
  )
}
