import { Segmented } from '@/components/ui'
import { type Lang, setLanguage, useLanguage, useT } from '@/lib/i18n'

// Idioma — same segmented control as ThemePicker. Applies immediately and
// persists (lib/i18n.ts owns both); every screen reading useT()/useLanguage()
// re-renders the instant this flips.
export function LanguagePicker() {
  const lang = useLanguage()
  const t = useT()
  return (
    <Segmented<Lang>
      accessibilityLabel={t('settings.language')}
      value={lang}
      onChange={setLanguage}
      options={[
        { value: 'es', label: t('settings.language.es') },
        { value: 'en', label: t('settings.language.en') },
      ]}
    />
  )
}
