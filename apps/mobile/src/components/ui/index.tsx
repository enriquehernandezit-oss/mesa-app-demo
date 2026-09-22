import { type ReactNode, startTransition, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  Switch,
  Text,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { ChevronIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'
import { useColor } from '@/theme/useColor'
import { BRASS_SHADOW } from '@/theme/vars'

// Mesa UI primitives, ported from apps/app/src/components/ui. Everything the app
// renders composes from these so the brand rules (brass-only accent, serif
// display, no stars) hold by default. Color/size come from the NativeWind token
// theme (tailwind.config.js), so `className` reads the same as on the web.
// `Display` (dead on web) and `ActionRail` (its Reserve/Order are in the cut
// set) are intentionally not ported.

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
  /\btext-(live-soft|on-live|live|cat-cata-soft|cat-musica-soft|cat-brunch-soft|cat-food-soft|cat-happy-soft|cat-cata|cat-musica|cat-brunch|cat-food|cat-happy|on-cat|bg-sunk|overlay-scrim|surface-raised|accent-strong|accent-fill|status-packed|status-building|tab-inactive|line-strong|status-good|on-photo-accent|btn-primary-bg|btn-primary-fg|status-slow|on-photo-2|on-accent|on-photo|text-muted|text-faint|surface|accent|text-2|line|text|bg)\b/
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
    className={`font-serif-semibold text-title leading-title ${hasTextColor(className) ? '' : 'text-text'} ${className ?? ''}`}
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
    className={`font-ui-semibold text-eyebrow uppercase tracking-eyebrow ${hasTextColor(className) ? '' : 'text-accent'} ${className ?? ''}`}
    {...p}
  />
)
export const SerifItalic = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-serif-italic ${hasTextColor(className) ? '' : 'text-text-2'} ${className ?? ''}`}
    {...p}
  />
)

/* Wordmark — lowercase serif "mesa"; size is caller-controlled. */
export const Wordmark = ({ size = 40, className }: { size?: number; className?: string }) => (
  <Text
    accessibilityLabel="mesa"
    className={`font-serif-semibold text-text ${className ?? ''}`}
    style={{ fontSize: size, lineHeight: size }}
  >
    mesa
  </Text>
)

/* --- Button --- */
type ButtonProps = Omit<PressableProps, 'children'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'md' | 'sm'
  icon?: ReactNode
  // Swaps the icon slot for a spinner and disables the button; the label stays,
  // so call sites keep their own "Guardando…"/"Eliminando…" copy.
  loading?: boolean
  children: ReactNode
  className?: string
}
const BTN_BG: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-btn-primary-bg',
  secondary: 'bg-transparent border border-line',
  ghost: 'bg-transparent',
  destructive: 'bg-status-packed',
}
const BTN_FG: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'text-btn-primary-fg',
  secondary: 'text-text',
  ghost: 'text-text-2',
  destructive: 'text-on-accent',
}
export const Button = ({
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  children,
  className,
  disabled,
  ...p
}: ButtonProps) => {
  const sm = size === 'sm'
  const off = disabled || loading
  // Ghost's taller tap target is a min-height default too, so it defers to a
  // caller's own min-h on the same terms as the size defaults above.
  const ghostMinH = variant === 'ghost' ? 'min-h-[44px]' : ''
  const sizing = [
    WIDTH_KEY.test(className ?? '') ? '' : sm ? 'w-auto' : 'w-full',
    MIN_H_KEY.test(className ?? '') ? '' : sm ? 'min-h-[40px]' : 'min-h-[52px]',
    PX_KEY.test(className ?? '') ? '' : sm ? 'px-4' : 'px-5',
    MIN_H_KEY.test(className ?? '') ? '' : ghostMinH,
  ]
    .filter(Boolean)
    .join(' ')
  // ActivityIndicator needs a resolved color, not a class — pull it from the
  // token layer so it tracks the theme (and stays hex-free per the design law).
  const onNeutral = useColor('accent')
  const onFilled = useColor('on-accent')
  const spinnerColor = variant === 'secondary' || variant === 'ghost' ? onNeutral : onFilled
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      disabled={off}
      className={`${sizing} flex-row items-center justify-center gap-2 rounded active:opacity-90 ${BTN_BG[variant]} ${off ? 'opacity-45' : ''} ${className ?? ''}`}
      style={
        variant === 'primary'
          ? {
              shadowColor: BRASS_SHADOW,
              shadowOpacity: 0.35,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }
          : undefined
      }
      {...p}
    >
      {loading ? <ActivityIndicator size="small" color={spinnerColor} /> : icon}
      <Text className={`font-ui-semibold text-label ${BTN_FG[variant]}`}>{children}</Text>
    </Pressable>
  )
}

/* --- Card --- */
export const Card = ({
  raised,
  className,
  ...p
}: ViewProps & { raised?: boolean; className?: string }) => (
  <View
    className={`rounded border border-line p-5 ${raised ? 'bg-surface-raised' : 'bg-surface'} ${className ?? ''}`}
    {...p}
  />
)

/* --- Chip --- the one chip in the app (md + sm; default/active/selected). */
type ChipProps = Omit<PressableProps, 'children'> & {
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
  ...p
}: ChipProps) => {
  const sm = size === 'sm'
  const filled = state === 'selected'
  // `active` used to collapse into the same filled look as `selected` at
  // size="sm" only (`filled = state === 'selected' || (sm && state ===
  // 'active')`) — so a sm trigger that's simply OPEN (Rankings' "Filtros"
  // chip while its panel is showing) was visually identical to one that has
  // filters APPLIED. `active` now gets the same outline treatment at both
  // sizes: it's "in progress," not "committed," and shouldn't look like it.
  const outlineActive = state === 'active'
  // Small controls shrink under the finger on iOS; a full-width Button dims
  // instead (a big primary action that shrinks reads as a gimmick), which is why
  // this lives here and not on Button.
  const press = 'active:scale-[0.97]'
  const box = sm
    ? `min-h-[36px] rounded-pill border px-3 py-2 ${press} ${filled ? 'bg-accent-fill border-accent' : outlineActive ? 'border-accent bg-transparent' : 'bg-surface border-line-strong'}`
    : `min-h-[44px] min-w-[44px] rounded-pill border px-3 py-2 ${press} ${filled ? 'bg-accent-fill border-accent' : outlineActive ? 'border-accent bg-transparent' : 'border-line bg-transparent'}`
  const fg = filled
    ? 'text-on-accent'
    : outlineActive
      ? 'text-accent'
      : sm
        ? 'text-text'
        : 'text-text-2'
  const font = sm ? 'font-ui-medium text-micro' : 'font-ui-medium text-label'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: state !== 'default' }}
      className={`flex-row items-center justify-center gap-2 active:opacity-80 ${box} ${className ?? ''}`}
      {...p}
    >
      {icon}
      <Text className={`${font} ${fg}`}>{children}</Text>
      {chevron ? (
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <ChevronIcon
            size={12}
            color={filled ? 'on-accent' : outlineActive ? 'accent' : sm ? 'text' : 'text-2'}
          />
        </View>
      ) : null}
    </Pressable>
  )
}

/* --- Segmented --- one sunk track, the selected option a raised white thumb
   that SLIDES to the tapped option. For mutually exclusive VIEW switches
   (Rankeados/Quiero probar/Barrios, Lugares/Eventos, Afternoon/Candlelit/
   Auto) — the founder's call to read these as one control instead of a row
   of separate pills. Filters that can stack (Barrio ▾, Ocasión ▾) stay
   Chips: they're not exclusive. The thumb is `surface-raised`, pure white on
   Afternoon, so it pops the same way the cards do against the cream ground.
   The thumb is one absolutely positioned view animated on the UI thread
   (translateX), so it glides even while the screen below is busy
   re-rendering for the new view. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  onClear,
  className,
  accessibilityLabel,
}: {
  // null = nothing selected (no thumb) — only meaningful with `onClear`.
  value: T | null
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  // When set, tapping the selected option clears it (a filter row's "any").
  onClear?: () => void
  className?: string
  accessibilityLabel?: string
}) {
  // A tap starts the thumb's slide on the UI thread and commits at once, inside
  // a transition — the slide keeps its frames while the caller re-renders, and
  // the new view is never held back (committing only after the slide landed
  // made every switch wait 220ms, and let ExploreFilters' "Apply" run before a
  // just-tapped price reached its draft). A value change from outside (the
  // prop) JUMPS the thumb instead — Rankings renders one of these per list, and
  // the copy that becomes visible after a switch must already sit on the new
  // option, not start a second slide of its own. The copy that was tapped
  // skips that jump for its own value, so its slide isn't cut short.
  const [local, setLocal] = useState(value)
  const tapped = useRef<T | null>(null)
  const [segW, setSegW] = useState(0)
  const x = useSharedValue(0)
  const found = options.findIndex((o) => o.value === local)
  const index = Math.max(0, found)
  const propIndex = options.findIndex((o) => o.value === value)
  useEffect(() => {
    setLocal(value)
    if (value !== null && value === tapped.current) {
      tapped.current = null
      return
    }
    if (segW > 0 && propIndex >= 0) x.value = propIndex * segW
  }, [value, propIndex, segW, x])
  const thumbOpacity = useSharedValue(found >= 0 ? 1 : 0)
  useEffect(() => {
    thumbOpacity.value = withTiming(found >= 0 ? 1 : 0, { duration: 160 })
  }, [found, thumbOpacity])
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: thumbOpacity.value,
    transform: [{ translateX: x.value }],
  }))
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => {
        const w = (e.nativeEvent.layout.width - SEG_PAD * 2) / options.length
        // First measure: place the thumb without animating from the left.
        if (segW === 0) x.value = index * w
        setSegW(w)
      }}
      className={`flex-row rounded-pill bg-bg-sunk ${className ?? ''}`}
      style={{ padding: SEG_PAD }}
    >
      {segW > 0 ? (
        <Animated.View
          pointerEvents="none"
          className="absolute rounded-pill bg-surface-raised"
          style={[
            {
              top: SEG_PAD,
              bottom: SEG_PAD,
              left: SEG_PAD,
              width: segW,
              shadowColor: BRASS_SHADOW,
              shadowOpacity: 0.18,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((o, i) => {
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
              tapped.current = o.value
              if (segW > 0) x.value = withTiming(i * segW, { duration: 220, easing: SEG_EASE })
              startTransition(() => onChange(o.value))
            }}
            className="min-h-[40px] flex-1 flex-row items-center justify-center gap-1.5 px-2"
          >
            {o.icon}
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              className={`text-label ${on ? 'font-ui-semibold text-text' : 'font-ui-medium text-text-muted'}`}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
const SEG_PAD = 4
const SEG_EASE = Easing.out(Easing.cubic)

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
    <SerifItalic className="text-serif-sm text-center">{children}</SerifItalic>
    {body && <Body className="text-center">{body}</Body>}
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
          <Text className="font-ui-semibold text-label text-accent-strong">
            {t('common.retry')}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

/* --- SectionHeader --- brass eyebrow + optional right-aligned action. */
export const SectionHeader = ({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) => (
  <View className="mb-3 mt-5 flex-row items-baseline justify-between gap-3">
    <Text className="font-ui-semibold text-eyebrow uppercase tracking-eyebrow text-accent-strong">
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
