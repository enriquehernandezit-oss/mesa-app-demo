import { Caption } from '@/components/ui'
import { type ThemeChoice, useTheme } from '@/theme/ThemeProvider'
import { Pressable, View } from 'react-native'

// Three appearance swatches — Afternoon (paper) / Candlelit (oxblood) / Auto.
// Applies immediately and persists (ThemeProvider owns both). Ported from
// apps/app/src/components/ui/ThemePicker.tsx; the CSS swatch chips become small
// Views. Their colors are literal PREVIEWS of each theme's ground, so they can't
// resolve through the active theme's tokens (the Afternoon chip must look like
// paper even while Candlelit is on) — this is the swatch exception DESIGN.md
// allows, the same reason the share card is frozen.
const OPTIONS: { value: ThemeChoice; label: string; chip: string; border: string }[] = [
  { value: 'afternoon', label: 'Afternoon', chip: '#f5efe4', border: '#e7dccb' },
  { value: 'candlelit', label: 'Candlelit', chip: '#210104', border: '#2c1516' },
  { value: 'auto', label: 'Auto', chip: '#8a5f24', border: '#c09050' },
]

export function ThemePicker() {
  const { choice, setChoice } = useTheme()
  return (
    <View className="flex-row gap-2" accessibilityLabel="Apariencia">
      {OPTIONS.map((o) => {
        const on = choice === o.value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => setChoice(o.value)}
            className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded border px-3 ${on ? 'border-accent bg-accent-fill' : 'border-line bg-surface'} active:opacity-80`}
          >
            <View
              className="h-3.5 w-3.5 rounded-pill border"
              style={{ backgroundColor: o.chip, borderColor: o.border }}
            />
            <Caption className={on ? 'text-accent-strong' : undefined}>{o.label}</Caption>
          </Pressable>
        )
      })}
    </View>
  )
}
