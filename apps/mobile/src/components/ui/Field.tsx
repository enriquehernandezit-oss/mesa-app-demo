import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import type { Ref } from 'react'
import { TextInput } from 'react-native'

// Every text input in Mesa. The same class string and muted placeholder were
// copy-pasted across nine files, and two screens had already grown their own
// local `Field` wrapper — so this is the one that existed implicitly, made real.
//
// It also carries the two things a bare TextInput gets wrong on iOS, in one
// place instead of nine:
//
//   keyboardAppearance — a Candlelit member typing a note used to get a blinding
//   white keyboard. It follows Mesa's RESOLVED theme, not the OS's, because Auto
//   turns Candlelit at 6pm on a light-mode phone.
//
//   selectionColor — the caret and selection are brass, not iOS system blue,
//   which is the one accent docs/DESIGN.md allows.
//
// Everything else passes through, so AutoFill hints (`textContentType`), return
// keys, and submit handlers are set per call site where they mean something.
type FieldProps = React.ComponentProps<typeof TextInput> & {
  // Roomier variant for multiline notes/captions.
  multilineBox?: boolean
  ref?: Ref<TextInput>
}

export function Field({ multilineBox, className, ref, ...props }: FieldProps) {
  const placeholder = useColor('text-muted')
  const accent = useColor('accent')
  const theme = useResolvedTheme()
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={placeholder}
      selectionColor={accent}
      keyboardAppearance={theme === 'candlelit' ? 'dark' : 'light'}
      className={`rounded border border-line bg-surface font-ui text-body text-text ${
        multilineBox ? 'min-h-[84px] p-3' : 'min-h-[52px] px-4'
      } ${className ?? ''}`}
      {...props}
    />
  )
}
