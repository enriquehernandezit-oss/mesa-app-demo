import { Alert } from 'react-native'

import { getLanguage, t } from './i18n'

// A message for a screen presented as a native modal (the rank sheet, the dish composer, the plan
// sheets, save-to-list). The Toaster is a root overlay and cannot draw above a presented modal, so a
// toast raised from one gave a haptic and nothing on screen: a failed note save or plan create looked
// like a button that did nothing. An Alert always shows. `retry` adds a Retry button beside OK.
export function modalAlert(message: string, retry?: () => void): void {
  const lang = getLanguage()
  Alert.alert(
    message,
    undefined,
    retry
      ? [
          { text: t(lang, 'common.cancel'), style: 'cancel' },
          { text: t(lang, 'common.retry'), onPress: retry },
        ]
      : [{ text: t(lang, 'common.ok') }],
  )
}
