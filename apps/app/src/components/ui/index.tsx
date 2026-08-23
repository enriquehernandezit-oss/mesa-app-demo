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

/* Error — a quiet message when a query fails. Pass `onRetry` (usually the
 * query's refetch) to render a concrete retry control; without it, the message
 * stands alone. The copy no longer promises "pull to refresh" — several screens
 * that use this aren't pull-to-refresh surfaces. */
export const ErrorState = ({
  className,
  children,
  onRetry,
  ...p
}: DivProps & { onRetry?: () => void }) => (
  <div className={cx('mesa-error', className)} {...p}>
    <p className="mesa-error__msg">
      {children ?? 'Algo salió mal. Intenta de nuevo en un momento.'}
    </p>
    {onRetry && (
      <button type="button" className="mesa-error__retry" onClick={onRetry}>
        Intentar de nuevo
      </button>
    )}
  </div>
)

/* --- Card --- */
export const Card = ({ raised, className, ...p }: DivProps & { raised?: boolean }) => (
  <div className={cx('mesa-card', raised && 'mesa-card--raised', className)} {...p} />
)

/* --- Chip --- the one chip in the app. `.tag-chip` and `.reserve-chip` were
 * folded into this in Phase 6; do not add a fourth. */
type ChipProps = HTMLAttributes<HTMLButtonElement> & {
  state?: 'default' | 'active' | 'selected'
  size?: 'sm' | 'md'
  icon?: ReactNode
}
export const Chip = ({
  state = 'default',
  size = 'md',
  icon,
  className,
  children,
  ...p
}: PropsWithChildren<ChipProps>) => (
  <button
    type="button"
    className={cx(
      'mesa-chip',
      size === 'sm' && 'mesa-chip--sm',
      state === 'active' && 'mesa-chip--active',
      state === 'selected' && 'mesa-chip--selected',
      className,
    )}
    {...p}
  >
    {icon}
    {children}
  </button>
)

/* Horizontal scrolling row of chips (Explore filters, rank search, Activity). */
export const ChipRail = ({ className, ...p }: DivProps) => (
  <div className={cx('mesa-chiprail', className)} {...p} />
)

/* --- SectionHeader --- mono brass eyebrow + optional right-aligned mono link.
 * The repeating "FEATURED LISTS … See all" / "THEIR SCORES" header everywhere a
 * screen names a section. `action` renders on the right (a Link or a button). */
export const SectionHeader = ({
  children,
  action,
  className,
  ...p
}: PropsWithChildren<DivProps & { action?: ReactNode }>) => (
  <div className={cx('section-head', className)} {...p}>
    <span className="section-head__title">{children}</span>
    {action && <span className="section-head__action">{action}</span>}
  </div>
)

/* --- ActionRail --- the feed/explore quick-action row: Reserve · Order · Nearby.
 * Reserve + Order are inert-by-design (they look live, do nothing); Nearby is a
 * real link. Built from the outlined utility-pill language. */
export const ActionRail = ({ className, ...p }: DivProps) => (
  <div className={cx('action-rail', className)} {...p} />
)

/* --- Toggle --- brass switch. Replaces raw checkboxes. Controlled: pass
 * `checked` + `onChange(next)`. `stale` marks an inert-by-design switch (still
 * flips visually, persists nothing meaningful) so it reads as live per design. */
export const Toggle = ({
  checked,
  onChange,
  label,
  className,
  ...p
}: Omit<HTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean
  onChange?: (next: boolean) => void
  label?: string
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={cx('mesa-toggle', checked && 'mesa-toggle--on', className)}
    onClick={() => onChange?.(!checked)}
    {...p}
  >
    <span className="mesa-toggle__knob" />
  </button>
)
