import { type ReactNode, startTransition, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  type StyleProp,
  Switch,
  Text,
  type TextProps,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { ChevronIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'
import type { ColorToken } from '@/theme/vars'

// Mesa UI primitives. Everything the app renders composes from these so the brand
// rules (one burgundy accent, upright serif display, no stars) hold by default.
// Color/size/radius come from the NativeWind token theme (tailwind.config.js), and
// the shapes are Redesign 2's (docs/DESIGN.md "Shape, depth, glass"): capsule
// buttons and pills, r24 cards, r18 fields — raised on Day by a warm lift, flat
// on Night.

/* --- Type ---
 * Every Text in Mesa routes through these, which is where Dynamic Type is
 * handled: iOS scales text with the member's chosen size, and Mesa's rows have
 * fixed heights (44pt targets, pills, score circles) that clip at the
 * accessibility sizes. So the scaling is CAPPED, never disabled — large text
 * still gets larger, it just can't break the layout. Display numerals cap lower
 * because they're already huge.
 */
export const MAX_SCALE = 1.35

// A caller's own `className` color (e.g. `text-on-accent` on a selected pill)
// is meant to REPLACE these primitives' default text color, not fight it —
// but NativeWind resolves a duplicated property by generated-CSS order, not
// by JSX string order, so the primitive's own `text-*` color class could
// silently win regardless of which one the caller intended. This checks only
// the color keys from tailwind.config.js's `colors` map (never the `text-*`
// FONT-SIZE keys like `text-label`/`text-title`, which share the same prefix
// but aren't colors) so the primitive can omit its default color whenever the
// caller already specified one.
const TEXT_COLOR_KEYS =
  /\btext-(hglass-fallback|pglass-fallback|glass-fallback|surface-raised|overlay-scrim|avatar-light|tab-inactive|accent-fill|accent-soft|hglass-line|line-strong|pglass-line|photo-scrim|glass-line|on-photo-2|text-faint|text-muted|hglass-fg|on-accent|bar-chip|on-photo|bg-sunk|surface|accent|danger|hglass|on-bar|on-ink|pglass|text-2|glass|hchip|chip|line|logo|text|bar|ink|bg)\b/
function hasTextColor(className?: string): boolean {
  return Boolean(className && TEXT_COLOR_KEYS.test(className))
}

// The same trap as TEXT_COLOR_KEYS, one layer down, for Button's size classes.
// `size` picks a default width / min-height / horizontal padding, and a caller
// passing its own in `className` means to REPLACE that default — but NativeWind
// again resolves the duplicate by generated-CSS order, so the primitive's
// `w-full` could silently beat a caller's `w-auto`. When it does, a Button in a
// flex-row eats the whole row: its `flex-1` siblings collapse to zero width and
// vanish. That is exactly how M19's saved-place rows shipped — every row
// rendered as a bare "Rank" button with the restaurant name squeezed out of
// existence. Each axis is tested on its own so a caller overriding only the
// padding doesn't also lose the width default.
const WIDTH_KEY = /\bw-(full|auto|\[[^\]]+\])\b/
const MIN_H_KEY = /\bmin-h-\[/
const PX_KEY = /\bpx-/

export const Title = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-serif text-title ${hasTextColor(className) ? '' : 'text-text'} ${className ?? ''}`}
    {...p}
  />
)
export const Body = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-ui text-body ${hasTextColor(className) ? '' : 'text-text-2'} ${className ?? ''}`}
    {...p}
  />
)
export const Caption = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-ui text-label ${hasTextColor(className) ? '' : 'text-text-muted'} ${className ?? ''}`}
    {...p}
  />
)
export const Eyebrow = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-ui-semibold text-meta ${hasTextColor(className) ? '' : 'text-text-muted'} ${className ?? ''}`}
    {...p}
  />
)
export const Serif = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-serif ${hasTextColor(className) ? '' : 'text-text-2'} ${className ?? ''}`}
    {...p}
  />
)

/* Wordmark — the lowercase word "mesa" in Instrument Serif, in the `logo` color
   (oxblood by day, cream at night).
   It is the only mark Mesa shows inside the app: the capital-M icon lives on the home
   screen and never on a screen. Size is caller-controlled and it never scales with Dynamic
   Type — it is a logo, not text; the line box is 1.15× so the tall serif never clips. */
export const Wordmark = ({ size = 40, className }: { size?: number; className?: string }) => (
  <Text
    accessibilityLabel="Mesa"
    allowFontScaling={false}
    className={`font-serif ${hasTextColor(className) ? '' : 'text-logo'} ${className ?? ''}`}
    style={{ fontSize: size, lineHeight: Math.round(size * 1.15) }}
  >
    mesa
  </Text>
)

/* --- Button --- a capsule. `primary` is the solid ink CTA, `secondary` the raised
   chip, `accent` the burgundy fill (the one loud action on a screen), `ghost` a
   hairline, `destructive` a danger ring. md is the 54pt CTA; sm the 46pt inline one. */
type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  style?: StyleProp<ViewStyle>
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive'
  size?: 'md' | 'sm'
  icon?: ReactNode
  // Swaps the icon slot for a spinner and disables the button; the label stays,
  // so call sites keep their own "Guardando…"/"Eliminando…" copy.
  loading?: boolean
  children: ReactNode
  className?: string
}
type ButtonVariant = NonNullable<ButtonProps['variant']>
const BTN_BG: Record<ButtonVariant, string> = {
  primary: 'bg-ink',
  secondary: 'bg-chip',
  accent: 'bg-accent-fill',
  ghost: 'border border-line-strong bg-transparent',
  destructive: 'border border-danger bg-transparent',
}
const BTN_FG: Record<ButtonVariant, string> = {
  primary: 'text-on-ink',
  secondary: 'text-text',
  accent: 'text-on-accent',
  ghost: 'text-text',
  destructive: 'text-danger',
}
// The spinner needs a resolved color, not a class — the same token as the label.
const BTN_SPINNER: Record<ButtonVariant, ColorToken> = {
  primary: 'on-ink',
  secondary: 'text',
  accent: 'on-accent',
  ghost: 'text',
  destructive: 'danger',
}
export const Button = ({
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  children,
  className,
  disabled,
  style,
  ...p
}: ButtonProps) => {
  const sm = size === 'sm'
  const off = disabled || loading
  const lift = useLift()
  const spinnerColor = useColor(BTN_SPINNER[variant])
  const sizing = [
    WIDTH_KEY.test(className ?? '') ? '' : sm ? 'w-auto' : 'w-full',
    MIN_H_KEY.test(className ?? '') ? '' : sm ? 'min-h-[46px]' : 'min-h-[54px]',
    PX_KEY.test(className ?? '') ? '' : 'px-5',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      disabled={off}
      className={`${sizing} flex-row items-center justify-center gap-2 rounded-pill active:opacity-90 ${BTN_BG[variant]} ${off ? 'opacity-45' : ''} ${className ?? ''}`}
      // The lift belongs to the raised kind only — a solid or hairline button on
      // the cream ground reads as a button without one.
      style={[variant === 'secondary' ? lift : undefined, style]}
      {...p}
    >
      {loading ? <ActivityIndicator size="small" color={spinnerColor} /> : icon}
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className={`font-ui-semibold ${sm ? 'text-subhead' : 'text-body'} ${BTN_FG[variant]}`}
      >
        {children}
      </Text>
    </Pressable>
  )
}

/* --- IconButton --- a round icon control: a 42pt raised chip by default (search, bell,
   back — the chrome of a screen), or a solid ink / burgundy circle. A `dot` draws the
   burgundy "something new" pip. Controls floating over a photograph use GlassCircle. */
export const IconButton = ({
  icon,
  onPress,
  accessibilityLabel,
  kind = 'chip',
  size = 42,
  dot,
  className,
}: {
  icon: ReactNode
  onPress: () => void
  accessibilityLabel: string
  kind?: 'chip' | 'solid' | 'accent'
  size?: number
  dot?: boolean
  className?: string
}) => {
  const lift = useLift()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={4}
      className={`items-center justify-center rounded-pill active:opacity-70 ${
        kind === 'solid' ? 'bg-ink' : kind === 'accent' ? 'bg-accent-fill' : 'bg-chip'
      } ${className ?? ''}`}
      style={[{ width: size, height: size }, kind === 'chip' ? lift : undefined]}
    >
      {icon}
      {dot ? (
        <View className="absolute right-2.5 top-2.5 h-2 w-2 rounded-pill border-[1.5px] border-chip bg-accent-fill" />
      ) : null}
    </Pressable>
  )
}

/* --- Card --- a content object: r24, white on Day (lifted), the night surface on Night
   (flat), no border. `raised` is the warmer inset step. */
export const Card = ({
  raised,
  className,
  style,
  ...p
}: ViewProps & { raised?: boolean; className?: string }) => {
  const lift = useLift()
  return (
    <View
      className={`rounded-card p-5 ${raised ? 'bg-surface-raised' : 'bg-surface'} ${className ?? ''}`}
      style={[lift, style]}
      {...p}
    />
  )
}

/* --- Chip --- the one pill in the app (md 36pt, sm 32pt): a raised capsule,
   the chosen one solid ink. `active` is a trigger that is OPEN (a ring, not a
   fill — it is "in progress", not "committed", and shouldn't look selected). */
type ChipProps = Omit<PressableProps, 'children' | 'style'> & {
  style?: StyleProp<ViewStyle>
  state?: 'default' | 'active' | 'selected'
  size?: 'sm' | 'md'
  icon?: ReactNode
  // Trailing caret for a chip that OPENS something (a dropdown/sheet) rather
  // than just toggling — visually distinct from `icon`, which is a leading
  // glyph naming the dimension (SortIcon, etc). Points down: this app's one
  // ChevronIcon is drawn pointing right (the settings-row ">" affordance);
  // rotated 90° it reads as the standard "opens below" caret.
  chevron?: boolean
  children: ReactNode
  className?: string
}
export const Chip = ({
  state = 'default',
  size = 'md',
  icon,
  chevron,
  children,
  className,
  style,
  ...p
}: ChipProps) => {
  const sm = size === 'sm'
  const selected = state === 'selected'
  const open = state === 'active'
  const lift = useLift()
  // A ring on every chip (transparent unless open) so opening one doesn't nudge the
  // row by a pixel. Small controls shrink under the finger on iOS; a full-width
  // Button dims instead (a big primary action that shrinks reads as a gimmick).
  const box = `${sm ? 'min-h-[32px]' : 'min-h-[36px]'} flex-row items-center justify-center gap-1.5 rounded-pill border px-3.5 active:scale-[0.97] ${
    selected
      ? 'border-transparent bg-ink'
      : open
        ? 'border-accent bg-chip'
        : 'border-transparent bg-chip'
  }`
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: state !== 'default' }}
      // The visible pill is 32–36pt; the finger target is not.
      hitSlop={sm ? 6 : 4}
      className={`${box} ${className ?? ''}`}
      style={[selected ? undefined : lift, style]}
      {...p}
    >
      {icon}
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className={`font-ui-semibold ${sm ? 'text-label' : 'text-pill'} ${selected ? 'text-on-ink' : 'text-text'}`}
      >
        {children}
      </Text>
      {chevron ? (
        <View style={{ transform: [{ rotate: '90deg' }], opacity: 0.7 }}>
          <ChevronIcon size={12} color={selected ? 'on-ink' : 'text'} />
        </View>
      ) : null}
    </Pressable>
  )
}

/* --- Segmented --- a row of equal pills for mutually exclusive VIEW switches
   (Mine/Saved/Neighborhoods, Places/Events, Auto/Day/Night). The chosen one is a
   solid ink pill, the rest raised chips — the same language as Chip, but one
   control: exactly one is always on. Filters that can stack (a neighborhood, an
   occasion) stay Chips.
   A tap flips the pill at once and commits inside a transition, so the switch is
   never held back by the screen below re-rendering for the new view (and
   ExploreFilters' "Apply" can't run before a just-tapped price reached its
   draft). A value change from outside — the prop — wins. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  onClear,
  className,
  accessibilityLabel,
}: {
  // null = nothing selected — only meaningful with `onClear`.
  value: T | null
  // An `icon` is drawn by the caller, so it picks its own color: `on-ink` on the
  // chosen pill, `text` on the others.
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  // When set, tapping the selected option clears it (a filter row's "any").
  onClear?: () => void
  className?: string
  accessibilityLabel?: string
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  const lift = useLift()
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className={`flex-row gap-2 ${className ?? ''}`}
    >
      {options.map((o) => {
        const on = o.value === local
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) {
                if (onClear) {
                  setLocal(null)
                  startTransition(onClear)
                }
                return
              }
              setLocal(o.value)
              startTransition(() => onChange(o.value))
            }}
            style={on ? undefined : lift}
            className={`min-h-[40px] flex-1 flex-row items-center justify-center gap-1.5 rounded-pill px-2 active:scale-[0.97] ${
              on ? 'bg-ink' : 'bg-chip'
            }`}
          >
            {o.icon}
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              className={`font-ui-semibold text-pill ${on ? 'text-on-ink' : 'text-text'}`}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/* Horizontal scrolling row of chips. Full-bleed: every caller already sits
   inside a px-5-padded screen, which used to double up here and cap the
   rail's SCROLLABLE VIEWPORT at screen−40pt (not just its resting position) —
   the actual cause of the "dead strip at both screen edges" on Explore, where
   three of these stack. `-mx-5` cancels the parent's padding so the viewport
   reaches the true edge; `px-5` on the content keeps the resting position
   unchanged. `className` (caller's own spacing, e.g. "mt-3") stays on the
   outer element so it still governs this rail's position in the page flow. */
export const ChipRail = ({ children, className }: { children: ReactNode; className?: string }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    // A rail placed under a focused TextInput (rank.tsx's search step) ate the
    // first tap as a keyboard-dismiss otherwise — RN checks each nested
    // scroll view outer-to-inner, so this default ('never') wins even when a
    // parent ScrollView is already 'handled'.
    keyboardShouldPersistTaps="handled"
    className={`-mx-5 ${className ?? ''}`}
    contentContainerClassName="gap-2 px-5"
  >
    {children}
  </ScrollView>
)

/* --- Skeleton --- a shimmering placeholder while data loads. */
export const Skeleton = ({
  height = 16,
  width = '100%',
  className,
}: {
  height?: number
  width?: number | string
  className?: string
}) => {
  const o = useSharedValue(0.5)
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true)
  }, [o])
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  return (
    <Animated.View
      className={`rounded-sm bg-bg-sunk ${className ?? ''}`}
      style={[{ height, width: width as number }, style]}
    />
  )
}

/* --- EmptyState / ErrorState --- */
export const EmptyState = ({
  children,
  body,
  action,
}: {
  children: ReactNode
  body?: ReactNode
  action?: ReactNode
}) => (
  <View className="mt-6 items-center gap-2 px-5">
    <Serif className="text-serif-xl text-center text-text">{children}</Serif>
    {body && <Body className="text-center text-text-muted">{body}</Body>}
    {action && <View className="mt-3">{action}</View>}
  </View>
)

/* --- RowsSkeleton --- avatar-and-two-lines rows, holding the shape the real
   rows will take so nothing jumps when the data lands. Same reasoning as the
   restaurant profile's loader: a screen whose row geometry is known ahead of
   time shouldn't throw that away for a spinner and reflow on arrival. Shared by
   activity, leaderboard and the passport.
   No horizontal padding of its own — every current caller except rank.tsx
   already renders this inside a `px-5`-padded ScrollView, so a self-padded
   default made every one of THOSE skeletons sit visibly narrower than the
   real rows that replace them: exactly the "jump" this component exists to
   prevent. `className` lets the one caller with no padded ancestor (rank.tsx)
   add its own. */
export const RowsSkeleton = ({
  rows = 4,
  thumb = 36,
  className,
}: {
  rows?: number
  thumb?: number
  className?: string
}) => (
  <View className={`gap-3 pt-2 ${className ?? ''}`}>
    {Array.from({ length: rows }, (_, i) => i).map((i) => (
      <View key={i} className="flex-row items-center gap-3 py-2">
        <Skeleton height={thumb} width={thumb} />
        <View className="flex-1 gap-2">
          <Skeleton height={13} width="62%" />
          <Skeleton height={10} width="38%" />
        </View>
      </View>
    ))}
  </View>
)

export const ErrorState = ({
  children,
  onRetry,
}: {
  children?: ReactNode
  onRetry?: () => void
}) => {
  const t = useT()
  return (
    <View className="mt-6 items-center px-5">
      <Caption className="text-center">{children ?? t('common.error_fallback')}</Caption>
      {onRetry && (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          className="mt-3 min-h-[44px] justify-center rounded-pill border border-accent px-4 active:opacity-80"
        >
          <Text className="font-ui-semibold text-label text-accent">{t('common.retry')}</Text>
        </Pressable>
      )}
    </View>
  )
}

/* --- SectionHeader --- a 21/600 title with an optional right-aligned action. */
export const SectionHeader = ({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) => (
  <View className="mb-3 mt-6 flex-row items-baseline justify-between gap-3">
    <Text
      maxFontSizeMultiplier={MAX_SCALE}
      className="shrink font-ui-semibold text-section text-text"
    >
      {children}
    </Text>
    {action}
  </View>
)

/* --- Toggle --- brass switch, replaces raw checkboxes. */
export const Toggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange?: (next: boolean) => void
  label?: string
}) => {
  // The real UISwitch: it animates, it can be dragged as well as tapped, and it
  // inherits every accessibility behavior iOS gives the control. The hand-rolled
  // pill it replaced only snapped between two positions. Prop API is unchanged,
  // so call sites didn't move. The thumb stays white — iOS keeps it white in
  // both appearances, and tinting it reads as a broken switch.
  const track = useColor('accent-fill')
  const off = useColor('line-strong')
  return (
    <Switch
      value={checked}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ false: off, true: track }}
      ios_backgroundColor={off}
    />
  )
}
