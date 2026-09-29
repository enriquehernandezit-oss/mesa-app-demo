import { startTransition, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Caption, MAX_SCALE } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { type ThemeChoice, useTheme } from '@/theme/ThemeProvider'
import { useLift } from '@/theme/useLift'

// Apariencia — Auto / Day / Night as three tiles, each a small literal PREVIEW of the theme it
// picks (this file is one of the places docs/DESIGN.md lets raw colour live: a swatch has to be
// the colour it shows, whatever theme the app is in right now). The chosen tile carries an ink
// ring. Applies immediately and persists (ThemeProvider owns both).
const DAY = { bg: '#f3ede4', fg: '#16110f', card: '#ffffff' }
const NIGHT = { bg: '#0b0809', fg: '#f4ede2', card: '#171213' }
const HAIRLINE = 'rgba(120, 80, 60, 0.18)'

function Preview({ kind }: { kind: ThemeChoice }) {
  if (kind === 'auto') {
    return (
      <View
        className="h-[96px] flex-row overflow-hidden rounded-[16px]"
        style={{ borderWidth: 1, borderColor: HAIRLINE }}
      >
        <View className="flex-1" style={{ backgroundColor: DAY.bg }} />
        <View className="flex-1" style={{ backgroundColor: NIGHT.bg }} />
      </View>
    )
  }
  const c = kind === 'day' ? DAY : NIGHT
  return (
    <View
      className="h-[96px] overflow-hidden rounded-[16px]"
      style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: HAIRLINE }}
    >
      <View
        style={{
          position: 'absolute',
          left: 10,
          top: 12,
          width: 50,
          height: 7,
          borderRadius: 4,
          backgroundColor: c.fg,
          opacity: 0.85,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          top: 28,
          height: 26,
          borderRadius: 9,
          backgroundColor: c.card,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          height: 18,
          borderRadius: 9,
          backgroundColor: c.fg,
          opacity: 0.9,
        }}
      />
    </View>
  )
}

function Tile({
  kind,
  title,
  sub,
  active,
  onPress,
}: {
  kind: ThemeChoice
  title: string
  sub: string
  active: boolean
  onPress: () => void
}) {
  const lift = useLift()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      className={`min-w-0 flex-1 rounded-group border-[2.5px] bg-surface p-1.5 pb-2 active:opacity-90 ${active ? 'border-ink' : 'border-transparent'}`}
      style={active ? undefined : lift}
    >
      <Preview kind={kind} />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="mt-2 px-1 font-ui-semibold text-pill text-text"
      >
        {title}
      </Text>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={MAX_SCALE}
        className="px-1 font-ui text-micro text-text-muted"
      >
        {sub}
      </Text>
    </Pressable>
  )
}

export function ThemePicker() {
  const t = useT()
  const { choice, setChoice } = useTheme()
  // The ring moves on the tap itself; the re-theme (which restyles every mounted View in the
  // app) follows as a transition. Doing both in one urgent update held the first paint long
  // enough that the tap looked dead and people tapped again.
  const [pending, setPending] = useState<ThemeChoice | null>(null)
  const shown = pending ?? choice
  useEffect(() => {
    if (pending === choice) setPending(null)
  }, [pending, choice])
  const pick = (v: ThemeChoice) => {
    setPending(v)
    startTransition(() => setChoice(v))
  }
  return (
    <View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('settings.appearance')}
        className="flex-row gap-2"
      >
        <Tile
          kind="auto"
          title={t('settings.theme_auto')}
          sub={t('settings.theme_auto_sub')}
          active={shown === 'auto'}
          onPress={() => pick('auto')}
        />
        <Tile
          kind="day"
          title={t('settings.theme_day')}
          sub={t('settings.theme_day_sub')}
          active={shown === 'day'}
          onPress={() => pick('day')}
        />
        <Tile
          kind="night"
          title={t('settings.theme_night')}
          sub={t('settings.theme_night_sub')}
          active={shown === 'night'}
          onPress={() => pick('night')}
        />
      </View>
      <Caption className="mt-3 px-1 text-label">{t('settings.appearance_auto_hint')}</Caption>
    </View>
  )
}
