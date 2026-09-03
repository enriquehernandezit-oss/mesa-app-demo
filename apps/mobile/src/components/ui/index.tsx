import { useColor } from '@/theme/useColor'
import { BRASS_SHADOW } from '@/theme/vars'
import { type ReactNode, useEffect } from 'react'
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
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

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
const MAX_SCALE = 1.35

export const Title = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-serif text-title leading-title text-text ${className ?? ''}`}
    {...p}
  />
)
export const Body = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-ui text-body text-text-2 ${className ?? ''}`}
    {...p}
  />
)
export const Caption = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-ui text-label text-text-muted ${className ?? ''}`}
    {...p}
  />
)
export const Eyebrow = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-ui-semibold text-eyebrow uppercase tracking-eyebrow text-accent ${className ?? ''}`}
    {...p}
  />
)
export const SerifItalic = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    maxFontSizeMultiplier={MAX_SCALE}
    className={`font-serif-italic text-text-2 ${className ?? ''}`}
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
  mono?: boolean
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
  mono,
  icon,
  loading,
  children,
  className,
  disabled,
  ...p
}: ButtonProps) => {
  const sm = size === 'sm'
  const off = disabled || loading
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
      className={`${sm ? 'w-auto min-h-[40px] px-4' : 'w-full min-h-[52px] px-5'} flex-row items-center justify-center gap-2 rounded active:opacity-90 ${BTN_BG[variant]} ${variant === 'ghost' ? 'min-h-[44px]' : ''} ${off ? 'opacity-45' : ''} ${className ?? ''}`}
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
      <Text
        className={`${mono ? 'font-mono text-eyebrow tracking-eyebrow' : 'font-ui-semibold text-label'} ${BTN_FG[variant]}`}
      >
        {children}
      </Text>
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
  children: ReactNode
  className?: string
}
export const Chip = ({
  state = 'default',
  size = 'md',
  icon,
  children,
  className,
  ...p
}: ChipProps) => {
  const sm = size === 'sm'
  const filled = state === 'selected' || (sm && state === 'active')
  // Small controls shrink under the finger on iOS; a full-width Button dims
  // instead (a big primary action that shrinks reads as a gimmick), which is why
  // this lives here and not on Button.
  const press = 'active:scale-[0.97]'
  const box = sm
    ? `min-h-[36px] rounded-pill border px-3 py-2 ${press} ${filled ? 'bg-accent-fill border-accent' : 'bg-surface border-line-strong'}`
    : `min-h-[44px] min-w-[44px] rounded-pill border px-3 py-2 ${press} ${state === 'selected' ? 'bg-accent-fill border-accent' : state === 'active' ? 'border-accent bg-transparent' : 'border-line bg-transparent'}`
  const fg = filled
    ? 'text-on-accent'
    : state === 'active'
      ? 'text-accent'
      : sm
        ? 'text-text'
        : 'text-text-2'
  const font = sm ? 'font-mono text-micro' : 'font-ui-medium text-label'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: state !== 'default' }}
      className={`flex-row items-center justify-center gap-2 active:opacity-80 ${box} ${className ?? ''}`}
      {...p}
    >
      {icon}
      <Text className={`${font} ${fg}`}>{children}</Text>
    </Pressable>
  )
}

/* Horizontal scrolling row of chips. */
export const ChipRail = ({ children, className }: { children: ReactNode; className?: string }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerClassName={`gap-2 ${className ?? ''}`}
  >
    {children}
  </ScrollView>
)

/* --- Skeleton --- a shimmering placeholder while data loads. */
export const Skeleton = ({
  height = 16,
  width = '100%',
  className,
}: { height?: number; width?: number | string; className?: string }) => {
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
}: { children: ReactNode; body?: ReactNode; action?: ReactNode }) => (
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
   activity, leaderboard and the passport. */
export const RowsSkeleton = ({ rows = 4, thumb = 36 }: { rows?: number; thumb?: number }) => (
  <View className="gap-3 px-5 pt-2">
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
}: { children?: ReactNode; onRetry?: () => void }) => (
  <View className="mt-6 items-center px-5">
    <Caption className="text-center">
      {children ?? 'Algo salió mal. Intenta de nuevo en un momento.'}
    </Caption>
    {onRetry && (
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="mt-3 min-h-[44px] justify-center rounded-pill border border-accent px-4 active:opacity-80"
      >
        <Text className="font-ui-semibold text-label text-accent-strong">Intentar de nuevo</Text>
      </Pressable>
    )}
  </View>
)

/* --- SectionHeader --- mono brass eyebrow + optional right-aligned action. */
export const SectionHeader = ({
  children,
  action,
}: { children: ReactNode; action?: ReactNode }) => (
  <View className="mb-3 mt-5 flex-row items-baseline justify-between gap-3">
    <Text className="font-mono text-micro uppercase tracking-micro text-accent-strong">
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
}: { checked: boolean; onChange?: (next: boolean) => void; label?: string }) => {
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
