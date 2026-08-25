import { useEffect, useState } from 'react'
import {
  type NavApp,
  type NavRequest,
  chooseNavApp,
  closeNavChooser,
  getLastNavApp,
  useNavRequest,
} from '../lib/navChooser'
import { CheckIcon } from './ui/icons'
import './nav-chooser.css'

const APPS: { id: NavApp; label: string }[] = [
  { id: 'waze', label: 'Waze' },
  { id: 'google', label: 'Google Maps' },
  { id: 'apple', label: 'Apple Maps' },
]

// One sheet, mounted once (main.tsx), shared by every "Cómo llegar" pill —
// see lib/navChooser.ts. The last choice sorts first and gets a check mark
// rather than being silently auto-opened, so "remembering" never turns into
// an unannounced redirect to an app the member forgot they'd picked.
export function NavChooserSheet() {
  const request = useNavRequest()
  return request ? <Sheet request={request} /> : null
}

function Sheet({ request }: { request: NavRequest }) {
  const [mounted, setMounted] = useState(false)
  const [lastApp, setLastApp] = useState<NavApp | null>(null)

  useEffect(() => {
    setMounted(true)
    getLastNavApp().then(setLastApp)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeNavChooser()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Waze can't take a text query — only offered when we have real
  // coordinates (every Mesa restaurant except the Tonight fixtures).
  const apps = request.kind === 'coords' ? APPS : APPS.filter((a) => a.id !== 'waze')
  const ordered = lastApp
    ? [...apps].sort((a, b) => (a.id === lastApp ? -1 : b.id === lastApp ? 1 : 0))
    : apps

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: mouse-only backdrop convenience; Escape (above) and each option button are the real keyboard paths
    <div className="nav-chooser-scrim" data-mounted={mounted} onClick={closeNavChooser}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no click semantics of its own — the real interactive elements are the buttons below */}
      <div className="nav-chooser" onClick={(e) => e.stopPropagation()}>
        <div className="nav-chooser__title">Cómo llegar a {request.label}</div>
        {ordered.map((app) => (
          <button
            key={app.id}
            type="button"
            className="nav-chooser__option"
            onClick={() => chooseNavApp(app.id, request)}
          >
            {app.label}
            {app.id === lastApp && <CheckIcon size={15} />}
          </button>
        ))}
        <button type="button" className="nav-chooser__cancel" onClick={closeNavChooser}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
