// Shared UI primitives, bound once to the brand tokens. Everything the app
// renders should compose from these so the look stays consistent and the
// design rules (brass-only accent, serif display, no stars) hold by default.
import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren, ReactNode } from 'react'
import './ui.css'

type DivProps = HTMLAttributes<HTMLDivElement>

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ')

/* --- Type --- */
export const Display = ({ className, ...p }: DivProps) => (
  <h1 className={cx('mesa-display', className)} {...p} />
)
export const Title = ({ className, ...p }: DivProps) => (
  <h2 className={cx('mesa-title', className)} {...p} />
)
export const Eyebrow = ({ className, ...p }: DivProps) => (
  <div className={cx('mesa-eyebrow', className)} {...p} />
)
export const Body = ({ className, ...p }: DivProps) => (
  <p className={cx('mesa-body', className)} {...p} />
)
export const Caption = ({ className, ...p }: DivProps) => (
  <div className={cx('mesa-caption', className)} {...p} />
)
export const SerifItalic = ({ className, ...p }: DivProps) => (
  <div className={cx('mesa-serif-italic', className)} {...p} />
)

/* Wordmark — lowercase serif "mesa". Size is caller-controlled. */
export const Wordmark = ({ size = 40, className, ...p }: DivProps & { size?: number }) => (
  <div
    className={cx('mesa-wordmark', className)}
    style={{ fontSize: size, ...p.style }}
    aria-label="mesa"
    {...p}
  >
    mesa
  </div>
)

/* --- Button --- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  icon?: ReactNode
}
export const Button = ({ variant = 'primary', icon, className, children, ...p }: ButtonProps) => (
  <button type="button" className={cx('mesa-btn', `mesa-btn--${variant}`, className)} {...p}>
    {icon}
    {children}
  </button>
)

/* Skeleton — a shimmering placeholder while data loads. */
export const Skeleton = ({
  height = 16,
  width = '100%',
  className,
  style,
  ...p
}: DivProps & { height?: number | string; width?: number | string }) => (
  <div className={cx('mesa-skeleton', className)} style={{ height, width, ...style }} {...p} />
)

/* Error — a quiet retry-friendly message when a query fails. */
export const ErrorState = ({ className, children, ...p }: DivProps) => (
  <div className={cx('mesa-error', className)} {...p}>
    {children ?? 'Something went wrong. Pull to refresh, or try again in a moment.'}
  </div>
)

/* --- Card --- */
export const Card = ({ raised, className, ...p }: DivProps & { raised?: boolean }) => (
  <div className={cx('mesa-card', raised && 'mesa-card--raised', className)} {...p} />
)

/* --- Chip --- */
type ChipProps = HTMLAttributes<HTMLButtonElement> & {
  state?: 'default' | 'active' | 'selected'
}
export const Chip = ({
  state = 'default',
  className,
  children,
  ...p
}: PropsWithChildren<ChipProps>) => (
  <button
    type="button"
    className={cx(
      'mesa-chip',
      state === 'active' && 'mesa-chip--active',
      state === 'selected' && 'mesa-chip--selected',
      className,
    )}
    {...p}
  >
    {children}
  </button>
)
