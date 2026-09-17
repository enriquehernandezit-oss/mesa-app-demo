import { Eyebrow } from '@/components/ui'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { ThemePicker } from '@/components/ui/ThemePicker'
import { useT } from '@/lib/i18n'
import { ScrollView, View } from 'react-native'

// Preferencias (M15) — Apariencia + Idioma, split out of the old flat
// app/settings.tsx.
export default function PreferencesSettings() {
  const t = useT()
  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Eyebrow className="mt-4 mb-2">{t('settings.appearance')}</Eyebrow>
        <ThemePicker />

        <Eyebrow className="mt-6 mb-2">{t('settings.language')}</Eyebrow>
        <LanguagePicker />
      </ScrollView>
    </View>
  )
}
