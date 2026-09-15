import { Caption } from '@/components/ui'
import { type Lang, setLanguage, useLanguage, useT } from '@/lib/i18n'
import { Pressable, View } from 'react-native'

// Two-option copy of ThemePicker.tsx, no swatch — just the label. Applies
// immediately and persists (lib/i18n.ts owns both). Mounted in Settings under
// "Idioma / Language" (M4 commit 3); every screen reading useT()/useLanguage()
// re-renders the instant this flips.
const OPTIONS: { value: Lang; key: 'settings.language.es' | 'settings.language.en' }[] = [
  { value: 'es', key: 'settings.language.es' },
  { value: 'en', key: 'settings.language.en' },
]

export function LanguagePicker() {
  const lang = useLanguage()
  const t = useT()
  return (
    <View className="flex-row gap-2" accessibilityLabel={t('settings.language')}>
      {OPTIONS.map((o) => {
        const on = lang === o.value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => setLanguage(o.value)}
            className={`min-h-[44px] flex-1 items-center justify-center rounded border px-3 ${on ? 'border-accent bg-accent-fill' : 'border-line bg-surface'} active:opacity-80`}
          >
            <Caption className={on ? 'text-on-accent' : undefined}>{t(o.key)}</Caption>
          </Pressable>
        )
      })}
    </View>
  )
}
