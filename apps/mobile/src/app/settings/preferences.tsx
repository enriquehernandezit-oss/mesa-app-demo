import { useHeaderHeight } from 'expo-router/build/react-navigation/elements'
import { useRef } from 'react'
import { ScrollView, View } from 'react-native'

import { DefaultCityPicker } from '@/components/DefaultCityPicker'
import { GroupLabel } from '@/components/SettingsRow'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { ThemePicker } from '@/components/ui/ThemePicker'
import { bringToTop, scrollViewHost } from '@/lib/bringToTop'
import { useT } from '@/lib/i18n'

// Preferencias (M15) — Apariencia + Idioma + la ciudad predeterminada, split out of the old flat
// app/settings.tsx. Redesign 2: three theme tiles with literal swatches, then the language as pills.
export default function PreferencesSettings() {
  const t = useT()
  const scrollRef = useRef<ScrollView>(null)
  // The page scrolls under the navigation bar, so the city search stops just below it.
  const headerHeight = useHeaderHeight()
  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        // Lets the city search slide to the top (lib/bringToTop.ts).
        scrollToOverflowEnabled
        contentContainerClassName="px-4 pb-12"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <GroupLabel>{t('settings.appearance')}</GroupLabel>
        <ThemePicker />

        <GroupLabel>{t('settings.language')}</GroupLabel>
        <LanguagePicker />

        <GroupLabel>{t('settings.default_city')}</GroupLabel>
        <DefaultCityPicker
          onSearchFocus={(e) => bringToTop(scrollViewHost(scrollRef), e, { top: headerHeight })}
        />
      </ScrollView>
    </View>
  )
}
