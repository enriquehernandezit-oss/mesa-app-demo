import { startTransition, useEffect, useState } from 'react'
import { View } from 'react-native'

import { Caption, Segmented } from '@/components/ui'
import { MoonIcon, SunIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'
import { type ThemeChoice, useTheme } from '@/theme/ThemeProvider'

// Apariencia — Auto / Afternoon / Candlelit as one segmented control (the
// founder's mock: one sunk track, a white thumb, sun/moon glyphs), replacing
// the three separate swatch pills. Applies immediately and persists
// (ThemeProvider owns both).
export function ThemePicker() {
  const t = useT()
  const { choice, setChoice } = useTheme()
  // The thumb moves on the tap itself; the re-theme (which restyles every
  // mounted View in the app) follows as a transition. Doing both in one
  // urgent update held the first paint long enough that the tap looked dead
  // and people tapped again.
  const [pending, setPending] = useState<ThemeChoice | null>(null)
  const shown = pending ?? choice
  useEffect(() => {
    if (pending === choice) setPending(null)
  }, [pending, choice])
  return (
    <View>
      <Segmented
        accessibilityLabel={t('settings.appearance')}
        value={shown}
        onChange={(v) => {
          setPending(v)
          startTransition(() => setChoice(v))
        }}
        options={[
          { value: 'auto', label: 'Auto' },
          {
            value: 'afternoon',
            label: 'Afternoon',
            icon: <SunIcon size={15} color={shown === 'afternoon' ? 'text' : 'text-muted'} />,
          },
          {
            value: 'candlelit',
            label: 'Candlelit',
            icon: <MoonIcon size={14} color={shown === 'candlelit' ? 'text' : 'text-muted'} />,
          },
        ]}
      />
      <Caption className="mt-2">{t('settings.appearance_auto_hint')}</Caption>
    </View>
  )
}
