import { type Href, Link } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import type { ReactNode } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'

import { Caption, Chip, Eyebrow, MAX_SCALE, SectionHeader } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Glass } from '@/components/ui/Glass'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { cuisineLabel, displayScore, priceLabel, scoreWordKey, tagLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES, GROUND, themeColors } from '@/theme/vars'

// A horizontal rail of cover cards under a section header — the same container
// three times over (featured lists, similar spots, trending). Only the card
// geometry differs, which is what `variant` on SpotCard carries.
//
// Full-bleed: the screens this sits in already pad their own contentContainer
// with px-5, which used to double up here and cap the rail's SCROLLABLE
// VIEWPORT at screen−40pt — not just its resting position. That left a ~20pt
// dead strip inside each screen edge (untappable, and where card titles were
// clipping before their numberOfLines ellipsis ever got a chance to fire,
// since the card wasn't overflowing, the viewport was). `-mx-5` cancels the
// parent's padding so the viewport reaches the true screen edge; `px-5` on
// the content keeps the resting (unscrolled) position visually identical.
export function SpotRail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <SectionHeader>{title}</SectionHeader>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="-mx-5"
        contentContainerClassName="gap-3 px-5 pt-2"
      >
        {children}
      </ScrollView>
    </View>
  )
}

// One card in a SpotRail. 'wide' is the editorial-list shape (short, letterbox);
// 'tall' is the place shape. `caption` is a node so a rail can put metadata
// (trending's cheer count) where another puts plain text.
export function SpotCard({
  href,
  name,
  coverImageId,
  caption,
  variant = 'tall',
}: {
  href: Href
  name: string
  coverImageId: string | null
  caption?: ReactNode
  variant?: 'wide' | 'tall'
}) {
  const wide = variant === 'wide'
  const lift = useLift()
  // A white r22 card, lifted on Day — photo on top, name and caption inside the card
  // (every content object is white on the cream ground, the featured lists
  // included). Two views: the outer carries the lift (a shadow is clipped by an
  // overflow on its own view), the inner rounds the photo's corners.
  return (
    <Link href={href} asChild>
      <Pressable
        className={`rounded-group bg-surface active:opacity-80 ${wide ? 'w-44' : 'w-36'}`}
        style={lift}
      >
        <View className="overflow-hidden rounded-group">
          <PlaceCover
            name={name}
            coverImageId={coverImageId}
            size={wide ? { w: 360, h: 220 } : { w: 320, h: 360 }}
            className={`rounded-none ${wide ? 'h-24 w-44' : 'h-36 w-36'}`}
          />
          <View className="px-3 pt-2 pb-3">
            <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
              {name}
            </Text>
            {caption}
          </View>
        </View>
      </Pressable>
    </Link>
  )
}

// A single stat in a passport/profile trio: serif number over a muted label.
// Shared by the user's own profile and another member's passport — the two
// are the same object and should read that way. text-serif-md, not -lg: a
// trio of these opens the screen before any real content, and at 30px they
// ran a third of the screen's height for numbers nobody taps.
// `onPress`, when given, renders the whole stat as a real control (44pt
// min-height, `active:opacity-70`, `accessibilityRole="button"`) instead of
// inert text — most call sites (Seguidores, Siguiendo, Rankeados…) name a
// destination that already has a screen, so it should be one tap away.
export function Stat({ n, l, onPress }: { n: string; l: string; onPress?: () => void }) {
  const body = (
    <>
      <Text style={DATA_FIGURES} className="font-serif text-serif-md text-text">
        {n}
      </Text>
      {/* One line, shrinking to fit — a four-up card left "Semanas racha"
          wrapping under its neighbours. */}
      <Caption numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} className="px-1">
        {l}
      </Caption>
    </>
  )
  if (!onPress) {
    return <View className="items-center">{body}</View>
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[44px] items-center justify-center active:opacity-70"
    >
      {body}
    </Pressable>
  )
}

// The "$$$ | Parrilla · Piantini" metadata block under a place's name, ported
// from apps/app/src/components/ui/patterns.tsx. Occasion tags on top, price |
// cuisine, then neighborhood · distance, then optional friend avatars.
// No `hours`: "hasta 1a" / "hasta 12a" was ambiguous (reads as both "1am" and
// "12 años") for what it added, and every call site dropped it — closesAt
// itself stays wired everywhere it's actually read as data (the "Abierto
// ahora" filters and their coverage gates), only the display copy is gone.
type CharacteristicsProps = {
  occasionTags?: string[]
  priceTier?: number | null
  cuisine?: string | null
  neighborhood?: string | null
  city?: string | null
  distance?: string | null
  social?: { people: { name: string; image?: string | null }[]; label?: string }
}

export function Characteristics({
  occasionTags,
  priceTier,
  cuisine,
  neighborhood,
  city,
  distance,
  social,
}: CharacteristicsProps) {
  const priceCuisine = [priceLabel(priceTier), cuisineLabel(cuisine)].filter(Boolean).join(' | ')
  const place = [[neighborhood, city].filter(Boolean).join(', '), distance]
    .filter(Boolean)
    .join(' · ')
  return (
    <View className="mt-1 gap-[2px]">
      {occasionTags && occasionTags.length > 0 && (
        <Caption className="font-ui-medium text-micro text-accent">
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

// A round utility tile — a 54pt chip circle with a glyph and its label under it:
// Website / Call / Directions / list membership. With `href` it opens via Linking behind an https/tel allow-list
// (a website value can be a server-provided Google field); else it runs onPress.
type ScoreAttribution =
  | { kind: 'you' }
  | { kind: 'user'; label: string }
  | { kind: 'friends'; count: number }
  | { kind: 'mesa'; count: number }
  // Whose score it is has already been said elsewhere on screen (e.g. the
  // feed card's own "X rankeó un spot" line right above) — no second caption
  // repeating the name under the ring.
  | { kind: 'stated' }

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
    // app-switch. Themed so it doesn't flash white over Night. tel:/mailto:
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
  const lift = useLift()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      className="flex-1 items-center gap-1.5 active:opacity-80"
    >
      <View
        className="h-[54px] w-[54px] items-center justify-center rounded-pill bg-chip"
        style={lift}
      >
        {icon}
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        className="font-ui text-micro text-text-2"
      >
        {children}
      </Text>
    </Pressable>
  )
}

function badgeText(a: ScoreAttribution, t: ReturnType<typeof useT>): string | null {
  if (a.kind === 'you') return 'Tú'
  if (a.kind === 'user') return a.label
  if (a.kind === 'friends') return t('friends.count_badge', { n: a.count })
  if (a.kind === 'stated') return null
  return null
}

// A score is a NUMBER + a WORD (docs/DESIGN.md): a serif figure and, beside it, what
// that figure means — 9+ Must go, 8+ Great, 7+ Good, 5+ Fine, else Skip.
//
// Every score is attributed; the place never gets its own bare rating. The ONE score
// treatment in the app: every call site renders through this (no bare `displayScore()`
// numerals, no hand-rolled rings) so a number always reads as a rating, never as a
// page number or a count.
//
//   kind  chip   — a soft burgundy wash, on a card (the default; a Mesa aggregate goes
//                  neutral so it recedes behind a person's own score)
//         photo  — dark glass, for a photograph
//         solid  — ink, the one that matters most on a screen
//
// The attribution caption ("Tú", a name, "3 amigos") sits under the capsule.
export function ScoreBadge({
  score,
  attribution,
  size = 'md',
  kind = 'chip',
  caption,
  sub,
  word = true,
}: {
  score: number
  attribution: ScoreAttribution
  size?: 'sm' | 'md'
  kind?: 'chip' | 'photo' | 'solid'
  caption?: string
  sub?: string
  // The number alone, for a tile too small for its word (the podium's #2 and #3).
  word?: boolean
}) {
  const t = useT()
  const badge = badgeText(attribution, t)
  const mesa = attribution.kind === 'mesa'
  const sm = size === 'sm'
  const box = `flex-row items-center ${sm ? 'min-h-[24px] gap-1 px-2' : 'min-h-[30px] gap-1.5 px-2.5'}`
  const ink = kind === 'photo' ? 'text-on-photo' : kind === 'solid' ? 'text-on-ink' : 'text-text'
  const figures = (
    <>
      <Text
        style={DATA_FIGURES}
        maxFontSizeMultiplier={MAX_SCALE}
        className={`font-serif ${sm ? 'text-serif-xs' : 'text-serif-sm'} ${ink}`}
      >
        {displayScore(score)}
      </Text>
      {word ? (
        <Text maxFontSizeMultiplier={MAX_SCALE} className={`font-ui-semibold text-eyebrow ${ink}`}>
          {t(scoreWordKey(score))}
        </Text>
      ) : null}
    </>
  )
  return (
    <View className="items-center gap-1">
      {kind === 'photo' ? (
        // `solid`: this pill is repeated down feeds and rails, so it is a flat dark
        // capsule, not a native glass view each (costly in a list, and a glass view
        // created while its parent is still fading in renders washed out).
        <Glass solid variant="photo" className={box}>
          {figures}
        </Glass>
      ) : (
        <View
          className={`${box} rounded-pill ${
            kind === 'solid' ? 'bg-ink' : mesa ? 'bg-bg-sunk' : 'bg-accent-soft'
          }`}
        >
          {figures}
        </View>
      )}
      {badge ? <Caption className="font-ui-medium text-micro text-accent">{badge}</Caption> : null}
      {caption ? <Caption>{caption}</Caption> : null}
      {sub ? <Caption className="text-text-faint">{sub}</Caption> : null}
    </View>
  )
}

// The dense-row form of a score: the figure over its word, right-aligned — for ranked
// lists and friends' notes where a capsule would crowd the row.
export function ScoreStack({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const t = useT()
  return (
    <View className="min-w-[52px] items-end">
      <Text
        style={DATA_FIGURES}
        maxFontSizeMultiplier={MAX_SCALE}
        className={`font-serif text-text ${size === 'sm' ? 'text-serif-xs' : 'text-serif-md'}`}
      >
        {displayScore(score)}
      </Text>
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className="mt-0.5 font-ui-semibold text-eyebrow text-accent"
      >
        {t(scoreWordKey(score))}
      </Text>
    </View>
  )
}

// One labeled group of sm Chips in a filter panel — a dimension's name over
// its options, the selected one filled. Shared by Rankings' "Filtros" panel
// and Explore's (D3), which used to each hand-roll their own filter surface
// in a different idiom; this is the one shape both now render through.
// `values`/`selected` are generic over string|number so a dimension like
// price (numeric) and cuisine (string) both fit without two components.
export function FilterGroup({
  label,
  values,
  selected,
  render,
  onToggle,
}: {
  label: string
  values: (string | number)[]
  selected: string | number | null
  render: (v: string | number) => string
  onToggle: (v: string | number) => void
}) {
  if (values.length === 0) return null
  return (
    <View>
      <Eyebrow className="mb-2">{label}</Eyebrow>
      <View className="flex-row flex-wrap gap-2">
        {values.map((v) => (
          <Chip
            key={String(v)}
            size="sm"
            state={selected === v ? 'selected' : 'default'}
            onPress={() => onToggle(v)}
          >
            {render(v)}
          </Chip>
        ))}
      </View>
    </View>
  )
}
