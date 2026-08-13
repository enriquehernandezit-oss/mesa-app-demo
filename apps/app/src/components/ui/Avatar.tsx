import type { CSSProperties } from 'react'
import './ui.css'

// One avatar everywhere: a photo when the user has one, else their initial in a
// brass-ringed circle. `src` accepts a data URL (in-app upload) or https URL.
// Warm avatar-gradient hues rotate by name so a person's initial keeps the same
// color everywhere. Referenced as token vars — no raw hex leaves tokens.css.
const HUES = ['--avatar-hue-1', '--avatar-hue-2', '--avatar-hue-3']
function hueFor(name: string): string {
  let sum = 0
  for (const ch of name.trim()) sum += ch.charCodeAt(0)
  return `var(${HUES[sum % HUES.length]})`
}

export function Avatar({
  name,
  src,
  size = 32,
}: {
  name: string
  src?: string | null
  size?: number
}) {
  const initial = name.trim().charAt(0).toUpperCase() || 'M'
  if (src) {
    return (
      <img
        className="mesa-avatar"
        src={src}
        alt=""
        style={{ width: size, height: size }}
        loading="lazy"
      />
    )
  }
  return (
    <div
      className="mesa-avatar mesa-avatar--initial"
      style={
        {
          width: size,
          height: size,
          fontSize: size * 0.44,
          '--avatar-hue': hueFor(name),
        } as CSSProperties
      }
      aria-hidden
    >
      {initial}
    </div>
  )
}
