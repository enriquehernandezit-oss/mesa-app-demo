import { useEffect, useState } from 'react'
import { type Toast, dismiss, useToasts } from './toast-store'
import './toast.css'

// Mounted once (main.tsx). Renders whatever toast-store holds; position/
// stacking are handled entirely by the fixed viewport below.
export function Toaster() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <section className="toast-viewport" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </section>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  // data-mounted fallback for browsers without @starting-style — flips true
  // one frame after mount so the CSS transition has a "from" state to animate.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    // <output>'s implicit role is "status" — an announced live region without
    // an explicit role attribute fighting Biome's semantic-elements rule.
    <output
      className="toast"
      data-variant={toast.variant ?? 'default'}
      data-mounted={mounted}
      data-dismissing={toast.dismissing ?? false}
    >
      <span className="toast__msg">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action?.onClick()
            dismiss(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
    </output>
  )
}
