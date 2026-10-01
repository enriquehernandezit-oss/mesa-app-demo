import { type ReactNode, type Ref, useId } from 'react'
import { Platform, Text, TextInput, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { KeyboardDone } from '@/components/ui/KeyboardDone'
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
//   a "Listo" bar above the keyboard on every SEARCH field (returnKeyType="search"). The
//   return key already dismisses, but it reads "Buscar" and a typing member didn't find it;
//   with results hidden behind the keyboard, a visible way out matters. A caller that passes
//   its own inputAccessoryViewID (the multiline note editors) keeps it.
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
  ...props
}: FieldProps) {
  const placeholder = useColor('text-faint')
  const accent = useColor('accent')
  const theme = useResolvedTheme()
  const lift = useLift()
  const accessoryId = useId()
  const autoDone =
    Platform.OS === 'ios' &&
    props.returnKeyType === 'search' &&
    !props.multiline &&
    props.inputAccessoryViewID == null
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
      inputAccessoryViewID={autoDone ? accessoryId : props.inputAccessoryViewID}
    />
  )
  // Not laid out (the accessory view is absolutely positioned and drawn above the keyboard), so
  // it never disturbs a parent's gap or the field's own box.
  const done = autoDone ? <KeyboardDone id={accessoryId} /> : null
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
  // Bare input unless there's a label/error to frame it — keeps every existing
  // call site's own layout (gap containers, refs) untouched.
  if (!label && !error) {
    return (
      <>
        {framed}
        {done}
      </>
    )
  }
  return (
    <View>
      {done}
      {label ? (
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="mb-1.5 font-ui-semibold text-label text-text-muted"
        >
          {label}
        </Text>
      ) : null}
      {framed}
      {error ? (
        <Text maxFontSizeMultiplier={MAX_SCALE} className="mt-1.5 font-ui text-micro text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  )
}
