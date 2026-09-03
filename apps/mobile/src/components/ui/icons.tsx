import { useColor } from '@/theme/useColor'
import type { ColorToken } from '@/theme/vars'
import type { ReactNode } from 'react'
import { Circle, Path, Svg } from 'react-native-svg'

// One icon language for the whole app, ported from apps/app/src/components/ui/
// icons.tsx. Same geometry: 24 viewBox, 1.6 stroke, round caps/joins. On the web
// these inherited `currentColor`; in RN there's no currentColor, so the base
// takes a semantic `color` token (default 'text') resolved for the active theme —
// which keeps "themes for free" and matches how className colors are chosen.
type IconProps = {
  size?: number
  color?: ColorToken
}

function Icon({ size = 16, color = 'text', children }: IconProps & { children: ReactNode }) {
  const stroke = useColor(color)
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  )
}

// Filled variant needs the fill color too (HeartFilled).
function FilledIcon({
  size = 16,
  color = 'accent',
  children,
}: IconProps & { children: ReactNode }) {
  const c = useColor(color)
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={c}
      stroke={c}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  )
}

export const WebIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="8.5" />
    <Path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5Z" />
  </Icon>
)
export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5.5 4h3l1.5 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2 4.5 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 6.2 2 2 0 0 1 5.5 4Z" />
  </Icon>
)
export const DirectionsIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3 12 20 5l-7 17-2.5-7.5L3 12Z" />
  </Icon>
)
export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 21s-6.5-5.9-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.1-6.5 11-6.5 11Z" />
    <Circle cx="12" cy="10" r="2.2" />
  </Icon>
)
export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 6.5h16M4 12h16M4 17.5h10" />
  </Icon>
)
// The single-chevron affordance for "row leads somewhere" (NavRows, list items).
// One glyph so the hardcoded "›" characters scattered across the app stop being
// a second, unstyled icon language.
export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 5l7 7-7 7" />
  </Icon>
)
export const SortIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M8 4v14M8 18l-3.5-3.5M8 18l3.5-3.5M16 20V6M16 6l3.5 3.5M16 6l-3.5 3.5" />
  </Icon>
)
export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M15 5 8 12l7 7" />
  </Icon>
)
export const ShareIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M7 17 17 7M9 7h8v8" />
  </Icon>
)
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M12 3v2.5M12 18.5V21M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M3 12h2.5M18.5 12H21M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
  </Icon>
)
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 12.5 10 17.5 19.5 7" />
  </Icon>
)
export const BookmarkIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 4h12v16l-6-4-6 4Z" />
  </Icon>
)
export const HeartIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 20.5s-7.5-4.6-9.7-9A5.3 5.3 0 0 1 12 6.3 5.3 5.3 0 0 1 21.7 11.5c-2.2 4.4-9.7 9-9.7 9Z" />
  </Icon>
)
export const HeartFilledIcon = (p: IconProps) => (
  <FilledIcon {...p}>
    <Path d="M12 20.5s-7.5-4.6-9.7-9A5.3 5.3 0 0 1 12 6.3 5.3 5.3 0 0 1 21.7 11.5c-2.2 4.4-9.7 9-9.7 9Z" />
  </FilledIcon>
)
export const CompassIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M15.5 8.5 13.3 13.3 8.5 15.5l2.2-4.8 4.8-2.2Z" />
  </Icon>
)

// Tab-bar + FAB glyphs (ported from app/router.tsx's inline paths).
export const DiscoverIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 4.4v15.2M12 3.1v17.8M15 4.4v15.2" />
  </Icon>
)
export const RankingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01" />
  </Icon>
)
export const PersonIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
  </Icon>
)
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 5v14M5 12h14" />
  </Icon>
)

// Leaderboard (trophy) + activity (bell) — ported from the web TopBar's inline SVGs.
export const TrophyIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4ZM7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
  </Icon>
)
export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0" />
  </Icon>
)
