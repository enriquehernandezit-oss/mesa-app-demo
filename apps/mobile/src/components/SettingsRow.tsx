import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Caption, MAX_SCALE } from '@/components/ui'
import { ChevronIcon } from '@/components/ui/icons'
import { useLift } from '@/theme/useLift'

// Shared by every settings screen (M15: app/settings/index.tsx split into a
// hub + Tu cuenta/Privacidad/Preferencias/Acerca de sub-screens) — was
// private to the single flat app/settings.tsx before the split; extracted
// here rather than duplicated per screen.
//
// The shape is Redesign 2's inset grouped list: rows sit in ONE white r22 card
// (lifted on Day, flat on Night — no border), 54pt tall, a hairline between rows.
// `Group` is the card; `Row`/`RowButton` are the rows; `NavRow` is the row that goes somewhere —
// a leading icon, the label, a muted value and a chevron.

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

// A row that leads somewhere (or does something): the icon in the ink colour, the label, then
// either a muted value and a chevron or whatever `trailing` says (a check, a spinner, nothing).
export function NavRow({
  icon,
  label,
  meta,
  onPress,
  disabled,
  last,
  chevron = true,
  trailing,
  tone = 'default',
}: {
  icon?: ReactNode
  label: string
  meta?: string
  onPress: () => void
  disabled?: boolean
  last?: boolean
  chevron?: boolean
  trailing?: ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <RowButton onPress={onPress} disabled={disabled} last={last}>
      {icon}
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className={`min-w-0 flex-1 font-ui text-body ${tone === 'danger' ? 'text-danger' : 'text-text'}`}
      >
        {label}
      </Text>
      {trailing !== undefined ? (
        trailing
      ) : (
        <>
          {meta ? <Caption numberOfLines={1}>{meta}</Caption> : null}
          {chevron ? <ChevronIcon size={16} color="text-faint" /> : null}
        </>
      )}
    </RowButton>
  )
}

// The small muted line above a group ("Friends", "Appearance") — 13/600, sentence case.
export function GroupLabel({ children }: { children: string }) {
  return (
    <Text
      maxFontSizeMultiplier={MAX_SCALE}
      className="mt-5 mb-2 px-1 font-ui-semibold text-label text-text-muted"
    >
      {children}
    </Text>
  )
}
