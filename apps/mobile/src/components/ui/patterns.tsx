import { Caption } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { cuisineLabel, priceLabel, tagLabel } from '@/lib/display'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { GROUND, themeColors } from '@/theme/vars'
import * as WebBrowser from 'expo-web-browser'
import type { ReactNode } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'

// A single stat in a passport/profile trio: big serif number over a muted
// label. Shared by the user's own profile and another member's passport — the
// two are the same object and should read that way.
export function Stat({ n, l }: { n: string; l: string }) {
  return (
    <View className="items-center">
      <Text className="font-serif text-serif-lg text-text">{n}</Text>
      <Caption>{l}</Caption>
    </View>
  )
}

// The "$$$ | Parrilla · Piantini" metadata block under a place's name, ported
// from apps/app/src/components/ui/patterns.tsx. Occasion tags on top, price |
// cuisine, then neighborhood · distance · hours, then optional friend avatars.
type CharacteristicsProps = {
  occasionTags?: string[]
  priceTier?: number | null
  cuisine?: string | null
  neighborhood?: string | null
  city?: string | null
  hours?: string | null
  distance?: string | null
  social?: { people: { name: string; image?: string | null }[]; label?: string }
}

export function Characteristics({
  occasionTags,
  priceTier,
  cuisine,
  neighborhood,
  city,
  hours,
  distance,
  social,
}: CharacteristicsProps) {
  const priceCuisine = [priceLabel(priceTier), cuisineLabel(cuisine)].filter(Boolean).join(' | ')
  const place = [[neighborhood, city].filter(Boolean).join(', '), distance, hours]
    .filter(Boolean)
    .join(' · ')
  return (
    <View className="mt-1 gap-[2px]">
      {occasionTags && occasionTags.length > 0 && (
        <Caption className="font-mono text-[10px] text-accent-strong">
          {occasionTags.map(tagLabel).join(' · ')}
        </Caption>
      )}
      {priceCuisine ? <Caption className="text-text-2">{priceCuisine}</Caption> : null}
      {place ? <Caption>{place}</Caption> : null}
      {social && social.people.length > 0 && (
        <View className="mt-1 flex-row items-center gap-1">
          {social.people.slice(0, 3).map((p) => (
            <Avatar key={p.name} name={p.name} src={p.image} size={20} />
          ))}
          {social.label ? <Caption className="ml-1">{social.label}</Caption> : null}
        </View>
      )}
    </View>
  )
}

import { displayScore } from '@/lib/display'

// Outlined utility pill with a leading glyph — Website / Call / Directions / list
// membership. With `href` it opens via Linking behind an https/tel allow-list
// (a website value can be a server-provided Google field); else it runs onPress.
type ScoreAttribution =
  | { kind: 'you' }
  | { kind: 'user'; label: string }
  | { kind: 'friends'; count: number }
  | { kind: 'mesa'; count: number }

export function UtilityPill({
  icon,
  children,
  href,
  onPress,
}: {
  icon?: ReactNode
  children: ReactNode
  href?: string
  onPress?: () => void
}) {
  const theme = useResolvedTheme()
  const open = () => {
    if (onPress) return onPress()
    if (!href) return
    // A web link opens IN the app (SFSafariViewController) instead of ejecting
    // to Safari — the member reads a menu and comes back with Done, they don't
    // app-switch. Themed so it doesn't flash white over Candlelit. tel:/mailto:
    // still hand off to the system, which is what they're for.
    if (/^https?:/.test(href)) {
      WebBrowser.openBrowserAsync(href, {
        controlsColor: themeColors[theme].accent,
        toolbarColor: GROUND[theme],
        dismissButtonStyle: 'done',
      }).catch(() => {})
      return
    }
    if (/^(tel:|mailto:)/.test(href)) Linking.openURL(href).catch(() => {})
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      className="min-h-[40px] flex-1 flex-row items-center justify-center gap-2 rounded-pill border border-line bg-surface px-3 active:opacity-80"
    >
      {icon}
      <Text className="font-mono text-[11px] text-text">{children}</Text>
    </Pressable>
  )
}

function badgeText(a: ScoreAttribution): string | null {
  if (a.kind === 'you') return 'Tú'
  if (a.kind === 'user') return a.label
  if (a.kind === 'friends') return `${a.count} ${a.count === 1 ? 'amigo' : 'amigos'}`
  return null
}

// Attributed score — a brass-ringed circle with the number, an attribution badge,
// and optional caption/sub. Every score is attributed; the place never gets its
// own bare rating. 'mesa' reads as a quiet unbadged number.
export function ScoreBadge({
  score,
  attribution,
  size = 'md',
  caption,
  sub,
}: {
  score: number
  attribution: ScoreAttribution
  size?: 'sm' | 'md'
  caption?: string
  sub?: string
}) {
  const badge = badgeText(attribution)
  const mesa = attribution.kind === 'mesa'
  const ring = size === 'sm' ? 'h-12 w-12' : 'h-16 w-16'
  const num = size === 'sm' ? 'text-serif-sm' : 'text-serif-md'
  return (
    <View className="items-center gap-1">
      <View
        className={`${ring} items-center justify-center rounded-pill border ${mesa ? 'border-line' : 'border-accent'}`}
      >
        <Text className={`font-serif ${num} ${mesa ? 'text-text-2' : 'text-accent'}`}>
          {displayScore(score)}
        </Text>
      </View>
      {badge ? (
        <Caption className="font-mono text-[10px] text-accent-strong">{badge}</Caption>
      ) : null}
      {caption ? <Caption>{caption}</Caption> : null}
      {sub ? <Caption className="text-text-faint">{sub}</Caption> : null}
    </View>
  )
}
