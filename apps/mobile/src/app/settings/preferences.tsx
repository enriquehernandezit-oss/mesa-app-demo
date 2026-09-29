import { ScrollView, View } from 'react-native'

import { GroupLabel } from '@/components/SettingsRow'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { ThemePicker } from '@/components/ui/ThemePicker'
import { useT } from '@/lib/i18n'

// Preferencias (M15) — Apariencia + Idioma, split out of the old flat
// app/settings.tsx. Redesign 2: three theme tiles with literal swatches, then the language as pills.
export default function PreferencesSettings() {
  const t = useT()
  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        <GroupLabel>{t('settings.appearance')}</GroupLabel>
        <ThemePicker />

        <GroupLabel>{t('settings.language')}</GroupLabel>
        <LanguagePicker />
      </ScrollView>
    </View>
  )
}
