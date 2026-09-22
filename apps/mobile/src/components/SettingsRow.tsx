import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

// Shared by every settings screen (M15: app/settings/index.tsx split into a
// hub + Tu cuenta/Privacidad/Preferencias/Acerca de sub-screens) — was
// private to the single flat app/settings.tsx before the split; extracted
// here rather than duplicated per screen.

export function Row({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <View
      className={`min-h-[52px] flex-row items-center gap-3 py-3 ${last ? '' : 'border-line border-b'}`}
    >
      {children}
    </View>
  )
}

export function RowButton({
  children,
  onPress,
  disabled,
  last,
}: {
  children: ReactNode
  onPress: () => void
  disabled?: boolean
  last?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center gap-3 py-3 active:opacity-70 ${last ? '' : 'border-line border-b'}`}
    >
      {children}
    </Pressable>
  )
}
