import { getResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'
import { ActionSheetIOS, Alert, Platform } from 'react-native'

// Every chooser and destructive confirm in Mesa goes through here, so they are
// real system surfaces instead of hand-rolled panels — and so they all get the
// same two things right:
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
