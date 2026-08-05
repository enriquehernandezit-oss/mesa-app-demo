import './ui.css'

// One avatar everywhere: a photo when the user has one, else their initial in a
// brass-ringed circle. `src` accepts a data URL (in-app upload) or https URL.
export function Avatar({
  name,
  src,
  size = 32,
}: {
  name: string
  src?: string | null
  size?: number
}) {
  const initial = name.trim().charAt(0).toLowerCase() || 'm'
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
      style={{ width: size, height: size, fontSize: size * 0.44 }}
      aria-hidden
    >
      {initial}
    </div>
  )
}
