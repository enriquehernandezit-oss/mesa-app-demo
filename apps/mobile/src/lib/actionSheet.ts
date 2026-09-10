import { getResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'
import { ActionSheetIOS, Alert, Platform } from 'react-native'

// Two kinds of call site stay here rather than moving to Mesa's own Sheet
// (components/ui/Sheet.tsx), which owns the rest of the app's choosers (sort,
// maps app, report reason):
//
//   The three single-destructive CONFIRMS (delete dish, block user, remove a
//   report) — system red-on-grey is the vocabulary people read as "this is
//   irreversible," and Mesa's paper would read as LESS serious, not more
//   on-brand, for exactly the moment that should feel most serious.
//
//   The camera-vs-library chooser (lib/dishPhoto.ts) — not a design choice,
//   a constraint: both its callers present as `presentation: 'modal'`, and
//   Sheet (a root-mounted JS overlay) does not render above an already-
//   presented native modal. See dishPhoto.ts's comment for what was tried.
//
// Being a real system surface here still gets two things right:
//
//   Theme. Mesa's resolved theme can be Candlelit while the OS is in light mode
//   (Auto flips at 6pm), so the sheet is told explicitly which appearance to use
//   rather than inheriting the system's guess and coming up white over oxblood.
//
//   Tint. Brass, from the token layer — the one accent Mesa allows.
//
// Resolves to the chosen index, or null when dismissed. Off-iOS it falls back to
// an Alert with the same contract, so callers never branch on platform.
export function showActionSheet(opts: {
  title?: string
  message?: string
  options: { label: string; destructive?: boolean }[]
  cancelLabel?: string
}): Promise<number | null> {
  const { title, message, options, cancelLabel = 'Cancelar' } = opts
  const theme = getResolvedTheme()
  const c = themeColors[theme]

  if (Platform.OS === 'ios') {
    return new Promise((resolve) => {
      const labels = [...options.map((o) => o.label), cancelLabel]
      const destructiveIndex = options.findIndex((o) => o.destructive)
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: labels,
          cancelButtonIndex: labels.length - 1,
          ...(destructiveIndex >= 0 ? { destructiveButtonIndex: destructiveIndex } : {}),
          tintColor: c.accent,
          userInterfaceStyle: theme === 'candlelit' ? 'dark' : 'light',
        },
        (i) => resolve(i === labels.length - 1 ? null : i),
      )
    })
  }

  return new Promise((resolve) => {
    Alert.alert(title ?? '', message, [
      ...options.map((o, i) => ({
        text: o.label,
        style: o.destructive ? ('destructive' as const) : undefined,
        onPress: () => resolve(i),
      })),
      { text: cancelLabel, style: 'cancel' as const, onPress: () => resolve(null) },
    ])
  })
}
