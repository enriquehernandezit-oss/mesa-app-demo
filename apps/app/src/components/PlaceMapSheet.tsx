import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { openNavChooser } from '../lib/navChooser'
import type { MapSpot } from '../lib/types'
import { DirectionsIcon } from './ui/icons'
import './place-map-sheet.css'

const MapGL = lazy(() => import('../screens/map/MapGL'))

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export interface PlaceMapTarget {
  id: string
  name: string
  lat: number
  lng: number
  address: string | null
  neighborhood: string | null
}

// The restaurant profile's map, opened full-screen and made real: pan, zoom,
// and read the streets around a place.
//
// Why a sheet rather than making the profile hero itself pannable: a map that
// swallows vertical drags sits inside a vertically-scrolling profile, so every
// attempt to scroll past it would instead pan the map. One primary gesture per
// region. The hero stays a tap target; panning lives here, where it's the only
// thing the surface does. It also keeps mapbox-gl (a large dependency) out of
// the profile's critical path — it downloads on open, not on view.
export function PlaceMapSheet({
  target,
  onClose,
}: { target: PlaceMapTarget; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [mounted, setMounted] = useState(false)
  const [settled, setSettled] = useState(false)
  // Latest onClose without re-running the open effect on every parent render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // A real <dialog> opened modally, not a div with role="dialog": the platform
  // then owns the focus trap, Escape, and making the page behind it inert —
  // all things a hand-rolled sheet gets subtly wrong. `close` fires for Escape
  // and for close() alike, so it's the single exit point.
  //
  // The map is built only after the entrance transition settles. Constructed
  // mid-transition, WebGL sizes its canvas correctly but skips painting while
  // the surface is still at opacity 0, and nothing re-triggers a full render —
  // the map comes up with its bottom third blank. Waiting costs one 200ms
  // transition and the Suspense fallback already covers it.
  useEffect(() => {
    const el = dialogRef.current
    el?.showModal()
    setMounted(true)

    // Escape is handled explicitly rather than through the dialog's own
    // `cancel`/`close` events: those are not dispatched in every webview Mesa
    // ships to (verified — close() flips `open` without ever firing `close`),
    // which would leave the sheet hidden while React still believed it was
    // open, and the next tap would silently do nothing. Same keydown approach
    // NavChooserSheet uses. showModal() is still what gives us the focus trap,
    // the inert background, and top-layer stacking.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)

    let done = false
    const finish = () => {
      if (done) return
      done = true
      setSettled(true)
    }
    el?.addEventListener('transitionend', finish)
    // Fallback: if the transition never runs (reduced motion collapsing it,
    // or the browser skipping it), the map must still appear.
    const timer = window.setTimeout(finish, 400)
    return () => {
      document.removeEventListener('keydown', onKey)
      el?.removeEventListener('transitionend', finish)
      window.clearTimeout(timer)
    }
  }, [])

  // Unmounting is the teardown: React removes the <dialog>, which drops it out
  // of the top layer. Calling close() first would only duplicate that.
  const dismiss = () => onCloseRef.current()

  // Directions closes the map first. The nav chooser is an ordinary fixed
  // element, and a modal <dialog> renders in the top layer above every
  // z-index — so leaving this open would hide the chooser behind it.
  const goToDirections = () => {
    dismiss()
    openNavChooser({ kind: 'coords', lat: target.lat, lng: target.lng, label: target.name })
  }

  // MapGL speaks MapSpot; one place is just a one-item list. Memoized because
  // MapGL rebuilds the whole map when these identities change, and this
  // component re-renders on mount.
  const spots: MapSpot[] = useMemo(
    () => [
      {
        id: target.id,
        name: target.name,
        cuisine: null,
        coverImageId: null,
        neighborhood: target.neighborhood,
        lat: target.lat,
        lng: target.lng,
        priceTier: null,
        friendAvg: null,
        friendCount: 0,
      },
    ],
    [target],
  )
  // Zoom 16 keeps street names readable — the block, not the rooftop.
  const center = useMemo(
    () => ({ lat: target.lat, lng: target.lng, zoom: 16 }),
    [target.lat, target.lng],
  )

  return (
    <dialog ref={dialogRef} className="place-map-sheet" data-mounted={mounted}>
      <div className="place-map-sheet__bar">
        <div className="place-map-sheet__id">
          <div className="place-map-sheet__name">{target.name}</div>
          {(target.address || target.neighborhood) && (
            <div className="place-map-sheet__meta">{target.address ?? target.neighborhood}</div>
          )}
        </div>
        <button
          type="button"
          className="place-map-sheet__close"
          onClick={dismiss}
          aria-label="Cerrar el mapa"
        >
          ✕
        </button>
      </div>

      <div className="place-map-sheet__canvas">
        {!MAPBOX_TOKEN ? (
          <div className="place-map-sheet__loading">El mapa no está disponible.</div>
        ) : settled ? (
          <Suspense fallback={<div className="place-map-sheet__loading">Cargando el mapa…</div>}>
            <MapGL
              spots={spots}
              me={null}
              token={MAPBOX_TOKEN}
              onSelect={() => {}}
              className="map-gl--sheet"
              center={center}
              highlightId={target.id}
            />
          </Suspense>
        ) : (
          <div className="place-map-sheet__loading">Cargando el mapa…</div>
        )}
      </div>

      <div className="place-map-sheet__actions">
        <button type="button" className="place-map-sheet__go" onClick={goToDirections}>
          <DirectionsIcon size={15} />
          Cómo llegar
        </button>
      </div>
    </dialog>
  )
}
