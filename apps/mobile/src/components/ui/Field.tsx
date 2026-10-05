import { type ReactNode, type Ref, useState } from 'react'
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'

// Every text input in Mesa. The same class string and muted placeholder were
// copy-pasted across nine files, and two screens had already grown their own
// local `Field` wrapper — so this is the one that existed implicitly, made real.
//
// It also carries the two things a bare TextInput gets wrong on iOS, in one
// place instead of nine:
//
//   keyboardAppearance — a Night member typing a note used to get a blinding
//   white keyboard. It follows Mesa's RESOLVED theme, not the OS's, because Auto
//   turns Night at 6pm on a light-mode phone.
//
//   selectionColor — the caret and selection follow the accent (burgundy by day,
//   cream at night), not iOS system blue.
//
// The shape is Redesign 2's field: r18, 52pt, a white card on Day (with the warm
// lift) and the night card colour on Night, no border — until it errors.
//
//   a "Listo" button beside every SEARCH field (returnKeyType="search") while it is focused.
//   The return key already dismisses, but it reads "Buscar" and a typing member didn't find
//   it; with results hidden behind the keyboard, a visible way out matters. It is a plain
//   button in the layout, NOT a keyboard InputAccessoryView: React Native shifts the offset of
//   every mounted scroll view that adjusts for the keyboard whenever the focused input has an
//   accessory view and sits outside it — the rank sheet's results jumped, and Explore under
//   the sheet was left scrolled out of place.
//
// Everything else passes through, so AutoFill hints (`textContentType`), return
// keys, and submit handlers are set per call site where they mean something.
type FieldProps = React.ComponentProps<typeof TextInput> & {
  // Roomier variant for multiline notes/captions.
  multilineBox?: boolean
  // An eyebrow above the input; when present the field renders wrapped.
  label?: string
  // A red line below the input (e.g. a failed save) — also reddens the border.
  error?: string
  // A leading glyph inside the field (mail, lock, search) — muted, non-interactive.
  icon?: ReactNode
  // The field sits INSIDE a white card (a settings group, a form panel): it takes the ground
  // colour and no lift, so it doesn't vanish into the card.
  onCard?: boolean
  ref?: Ref<TextInput>
}

export function Field({
  multilineBox,
  label,
  error,
  icon,
  onCard,
  className,
  style,
  ref,
  onFocus,
  onBlur,
  ...props
}: FieldProps) {
  const t = useT()
  const [focused, setFocused] = useState(false)
  const placeholder = useColor('text-faint')
  const accent = useColor('accent')
  const theme = useResolvedTheme()
  const lift = useLift()
  const searchField = props.returnKeyType === 'search' && !props.multiline
  const input = (
    <TextInput
      ref={ref}
      placeholderTextColor={placeholder}
      selectionColor={accent}
      keyboardAppearance={theme === 'night' ? 'dark' : 'light'}
      maxFontSizeMultiplier={MAX_SCALE}
      className={`rounded border ${onCard ? 'bg-bg' : 'bg-surface'} font-ui text-body text-text ${
        error ? 'border-danger' : 'border-transparent'
      } ${multilineBox ? 'min-h-[84px] p-4' : icon ? 'min-h-[52px] pl-11 pr-4' : 'min-h-[52px] px-4'} ${className ?? ''}`}
      style={[onCard ? undefined : lift, style]}
      {...props}
      onFocus={(e) => {
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        onBlur?.(e)
      }}
    />
  )
  const framed = icon ? (
    <View className="justify-center">
      {input}
      <View pointerEvents="none" className="absolute left-4">
        {icon}
      </View>
    </View>
  ) : (
    input
  )
  // A search field is always wrapped in the same row (so focusing never remounts the input);
  // the button joins it only while focused.
  const boxed = searchField ? (
    <View className="flex-row items-center">
      <View className="flex-1">{framed}</View>
      {focused ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => Keyboard.dismiss()}
          hitSlop={8}
          className="min-h-[44px] justify-center pl-3 active:opacity-60"
        >
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui-semibold text-label text-accent"
          >
            {t('common.done')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  ) : (
    framed
  )
  // Bare input unless there's a label/error to frame it — keeps every existing
  // call site's own layout (gap containers, refs) untouched.
  if (!label && !error) return boxed
  return (
    <View>
      {label ? (
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="mb-1.5 font-ui-semibold text-label text-text-muted"
        >
          {label}
        </Text>
      ) : null}
      {boxed}
      {error ? (
        <Text maxFontSizeMultiplier={MAX_SCALE} className="mt-1.5 font-ui text-micro text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  )
}
