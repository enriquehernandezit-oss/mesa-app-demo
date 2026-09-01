import { type ReactNode, useEffect } from 'react'
import {
  Pressable,
  type PressableProps,
  ScrollView,
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

/* --- Type --- */
export const Title = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text className={`font-serif text-title leading-[28px] text-text ${className ?? ''}`} {...p} />
)
export const Body = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text className={`font-ui text-body text-text-2 ${className ?? ''}`} {...p} />
)
export const Caption = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text className={`font-ui text-label text-text-muted ${className ?? ''}`} {...p} />
)
export const Eyebrow = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text
    className={`font-ui-semibold text-eyebrow uppercase tracking-eyebrow text-accent ${className ?? ''}`}
    {...p}
  />
)
export const SerifItalic = ({ className, ...p }: TextProps & { className?: string }) => (
  <Text className={`font-serif-italic text-text-2 ${className ?? ''}`} {...p} />
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
  variant?: 'primary' | 'secondary' | 'ghost'
  mono?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}
const BTN_BG: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-btn-primary-bg',
  secondary: 'bg-transparent border border-line',
  ghost: 'bg-transparent',
}
const BTN_FG: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'text-btn-primary-fg',
  secondary: 'text-text',
  ghost: 'text-text-2',
}
export const Button = ({
  variant = 'primary',
  mono,
  icon,
  children,
  className,
  disabled,
  ...p
}: ButtonProps) => (
  <Pressable
    accessibilityRole="button"
    disabled={disabled}
    className={`w-full min-h-[52px] flex-row items-center justify-center gap-2 rounded px-5 active:opacity-90 ${BTN_BG[variant]} ${variant === 'ghost' ? 'min-h-[44px]' : ''} ${disabled ? 'opacity-45' : ''} ${className ?? ''}`}
    style={
      variant === 'primary'
        ? {
            shadowColor: '#6b4715',
            shadowOpacity: 0.35,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }
        : undefined
    }
    {...p}
  >
    {icon}
    <Text
      className={`${mono ? 'font-mono text-eyebrow tracking-eyebrow' : 'font-ui-semibold text-label'} ${BTN_FG[variant]}`}
    >
      {children}
    </Text>
  </Pressable>
)

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
  const box = sm
    ? `min-h-[36px] rounded-pill border px-3 py-2 ${filled ? 'bg-accent-fill border-accent' : 'bg-surface border-line-strong'}`
    : `min-h-[44px] min-w-[44px] rounded-pill border px-3 py-2 ${state === 'selected' ? 'bg-accent-fill border-accent' : state === 'active' ? 'border-accent bg-transparent' : 'border-line bg-transparent'}`
  const fg = filled
    ? 'text-on-accent'
    : state === 'active'
      ? 'text-accent'
      : sm
        ? 'text-text'
        : 'text-text-2'
  const font = sm ? 'font-mono text-[10px]' : 'font-ui-medium text-label'
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
export const EmptyState = ({ children, body }: { children: ReactNode; body?: ReactNode }) => (
  <View className="mt-6 items-center gap-2 px-5">
    <SerifItalic className="text-serif-sm text-center">{children}</SerifItalic>
    {body && <Body className="text-center">{body}</Body>}
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
    <Text className="font-mono text-[10px] uppercase tracking-[0.8px] text-accent-strong">
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
}: { checked: boolean; onChange?: (next: boolean) => void; label?: string }) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityState={{ checked }}
    accessibilityLabel={label}
    onPress={() => onChange?.(!checked)}
    className={`h-[28px] w-[48px] justify-center rounded-pill px-[3px] ${checked ? 'bg-accent-fill' : 'bg-line-strong'}`}
  >
    <View
      className="h-[22px] w-[22px] rounded-pill bg-surface"
      style={{
        alignSelf: checked ? 'flex-end' : 'flex-start',
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      }}
    />
  </Pressable>
)
