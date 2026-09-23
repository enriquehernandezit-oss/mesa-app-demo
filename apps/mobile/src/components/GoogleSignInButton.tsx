import { Pressable, Text } from 'react-native'
import { Path, Svg } from 'react-native-svg'

import { useResolvedTheme } from '@/theme/ThemeProvider'

// Google's own "Sign in with Google" button, hand-built rather than the SDK's
// <GoogleSigninButton>: that component only renders Google's retired blue
// style, which their current brand guidelines replaced with this pill (white
// with a grey hairline, or near-black). Same reasoning that exempts Apple's
// native button from the token layer — the mark, the colors and the wording
// are Google's to specify, not Mesa's, so the literals below are brand assets
// rather than design decisions (docs/DESIGN.md, "Where color is allowed to
// live"). Everything else about it — the height, the pill radius, the type —
// matches the Apple button it sits under.
const G_BLUE = '#4285F4'
const G_GREEN = '#34A853'
const G_YELLOW = '#FBBC05'
const G_RED = '#EA4335'

// Google's light and dark button surfaces, from the same brand spec.
const LIGHT_BG = '#FFFFFF'
const LIGHT_BORDER = '#747775'
const LIGHT_TEXT = '#1F1F1F'
const DARK_BG = '#131314'
const DARK_BORDER = '#8E918F'
const DARK_TEXT = '#E3E3E3'

function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={G_BLUE}
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill={G_GREEN}
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill={G_YELLOW}
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill={G_RED}
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  )
}

export function GoogleSignInButton({
  label,
  onPress,
  disabled,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  // Mirrors the Apple button's own mapping: the light surface on Candlelit,
  // the dark one on Afternoon, so the two read as a pair rather than fighting
  // each other.
  const dark = useResolvedTheme() !== 'candlelit'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className="h-[52px] w-full flex-row items-center justify-center gap-3 rounded-pill active:opacity-80"
      style={{
        backgroundColor: dark ? DARK_BG : LIGHT_BG,
        borderWidth: 1,
        borderColor: dark ? DARK_BORDER : LIGHT_BORDER,
      }}
    >
      <GoogleMark />
      <Text className="font-ui-medium text-body" style={{ color: dark ? DARK_TEXT : LIGHT_TEXT }}>
        {label}
      </Text>
    </Pressable>
  )
}
