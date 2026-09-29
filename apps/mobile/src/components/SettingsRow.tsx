import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import { useLift } from '@/theme/useLift'

// Shared by every settings screen (M15: app/settings/index.tsx split into a
// hub + Tu cuenta/Privacidad/Preferencias/Acerca de sub-screens) — was
// private to the single flat app/settings.tsx before the split; extracted
// here rather than duplicated per screen.
//
// The shape is Redesign 2's inset grouped list: rows sit in ONE white r22 card
// (lifted on Day, flat on Night — no border), 54pt tall, a hairline between rows.
// `Group` is the card; `Row`/`RowButton` are the rows.

export function Group({ children, className }: { children: ReactNode; className?: string }) {
  const lift = useLift()
  return (
    <View className={`rounded-group bg-surface px-4 ${className ?? ''}`} style={lift}>
      {children}
    </View>
  )
}

export function Row({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <View
      className={`min-h-[54px] flex-row items-center gap-3 py-2.5 ${last ? '' : 'border-line border-b'}`}
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
      className={`min-h-[54px] flex-row items-center gap-3 py-2.5 active:opacity-70 ${last ? '' : 'border-line border-b'}`}
    >
      {children}
    </Pressable>
  )
}
