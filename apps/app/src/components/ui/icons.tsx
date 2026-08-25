// One icon language for the whole app. Before this, the same kind of control
// (an icon-only button, a pill's leading glyph) mixed three systems: the tab
// bar's stroke SVGs, ad hoc Unicode dingbats (◉ ☏ ▸ ▤ ✎ ⇅ ↗ ☰ ✓ ◇ ♡), and 🥂
// for the brand's cheers gesture. The dingbats also render unpredictably
// across iOS/Android webviews (tofu or emoji-style substitution on some
// systems), unlike a shipped SVG path. This file is the one place new icons
// get added — reuse before adding a new glyph.
//
// Stroke style matches the tab bar's existing Icon() in app/router.tsx:
// 24 viewBox, 1.6 stroke, round caps/joins, currentColor (themes for free).
import type { ReactNode, SVGProps } from 'react'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'fill' | 'stroke'> & {
  size?: number
}

function Icon({ size = 16, children, ...p }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      role="presentation"
      {...p}
    >
      {children}
    </svg>
  )
}

// Website / a place's own link — was ◉
export const WebIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5Z" />
  </Icon>
)

// Reserve a table / "Reservar" — was also ◉, but a different meaning than the
// website pill above (booking, not a link); kept distinct.
export const ReserveIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5M12 13.5l2.2 2.2" />
    <circle cx="12" cy="13.5" r="3.2" />
  </Icon>
)

// Call — was ☏
export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 4h3l1.5 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2 4.5 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 6.2 2 2 0 0 1 5.5 4Z" />
  </Icon>
)

// Directions / "Cómo llegar" — was ▸
export const DirectionsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12 20 5l-7 17-2.5-7.5L3 12Z" />
  </Icon>
)

// Nearby / "Cerca" (map) — was ➤
export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s-6.5-5.9-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.1-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.2" />
  </Icon>
)

// List membership pill — was ▤ ("≡ Mesa Best · DR 2026")
export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h10" />
  </Icon>
)

// Order / "Pedir" (food delivery) — was also ▤, but a different meaning than
// the list-membership pill above; kept distinct rather than sharing an icon.
export const OrderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8.5 6.5 4h11L19 8.5M5 8.5h14M5 8.5 6 19a1.6 1.6 0 0 0 1.6 1.5h8.8A1.6 1.6 0 0 0 18 19l1-10.5" />
  </Icon>
)

// Inline edit affordance ("2 · esta noche ✎") — was ✎
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.5 4.5 19.5 8.5 8 20H4v-4Z" />
  </Icon>
)

// Sort toggle chip — was ⇅
export const SortIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4v14M8 18l-3.5-3.5M8 18l3.5-3.5M16 20V6M16 6l3.5 3.5M16 6l-3.5 3.5" />
  </Icon>
)

// Back — floating photo-chrome buttons (resto-back etc). ScreenHeader/BackBar
// keep their own text "‹" (that's an established typographic convention
// baked into the mocks' literal copy strings, e.g. "‹ Add a note" — not a
// stray glyph to unify away). This is only for icon-only circular buttons.
export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5 8 12l7 7" />
  </Icon>
)

// Share — was ↗
export const ShareIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Icon>
)

// Settings/menu — was ☰
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M3 12h2.5M18.5 12H21M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
  </Icon>
)

// Save-check ("Quiero probar" toggle) — was ✓
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5 10 17.5 19.5 7" />
  </Icon>
)

// "Quiero probar" nav row — was ◇
export const BookmarkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4h12v16l-6-4-6 4Z" />
  </Icon>
)

// The reaction (Cheers/CheersButton, was 🥂) — outline is the inactive state,
// HeartFilledIcon is the active one. Was ♡ at "Recomendados para ti" before
// that row moved to CompassIcon below, freeing the shape for its more literal
// meaning.
export const HeartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20.5s-7.5-4.6-9.7-9A5.3 5.3 0 0 1 12 6.3 5.3 5.3 0 0 1 21.7 11.5c-2.2 4.4-9.7 9-9.7 9Z" />
  </Icon>
)

export const HeartFilledIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M12 20.5s-7.5-4.6-9.7-9A5.3 5.3 0 0 1 12 6.3 5.3 5.3 0 0 1 21.7 11.5c-2.2 4.4-9.7 9-9.7 9Z"
      fill="currentColor"
    />
  </Icon>
)

// "Recomendados para ti" nav row. A compass reads as "discovery" without
// looking like a rating — DESIGN.md bans star glyphs outright, and Mesa never
// shows a rating symbol of any kind.
export const CompassIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5 13.3 13.3 8.5 15.5l2.2-4.8 4.8-2.2Z" />
  </Icon>
)
