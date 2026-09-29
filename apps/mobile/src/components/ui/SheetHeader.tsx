import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton, MAX_SCALE } from '@/components/ui'
import { BackIcon, CloseIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'

// The top of a step that opens as a page sheet (the new-table steps, inviting more people): a
// round chip at the left — Close on the first step, Back after it — a small centred line naming
// the sheet, and the title below it in the serif. Like RankHeader it carries the top inset
// itself, so every step starts at the same height.
export function SheetHeader({
  onBack,
  onClose,
  label,
}: {
  onBack?: () => void
  onClose?: () => void
  label?: string
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
        ) : onClose ? (
          <IconButton
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            icon={<CloseIcon size={18} color="text" />}
          />
        ) : (
          <View className="h-[42px] w-[42px]" />
        )}
        {label ? (
          <View pointerEvents="none" className="absolute inset-x-0 items-center">
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-label text-text-muted"
            >
              {label}
            </Text>
          </View>
        ) : null}
        <View className="h-[42px] w-[42px]" />
      </View>
    </View>
  )
}

// The step's title, in the serif, under a SheetHeader.
export function SheetTitle({ children }: { children: string }) {
  return (
    <Text
      maxFontSizeMultiplier={MAX_SCALE}
      className="px-5 pt-3 font-serif text-headline text-text"
    >
      {children}
    </Text>
  )
}
