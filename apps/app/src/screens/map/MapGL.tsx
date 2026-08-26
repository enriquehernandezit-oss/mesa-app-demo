import mapboxgl from 'mapbox-gl'
import { useEffect, useRef } from 'react'
import type { LatLng } from '../../lib/geo'
import type { MapSpot } from '../../lib/types'
import 'mapbox-gl/dist/mapbox-gl.css'
import './map-gl.css'

// The real, pannable/zoomable street map (MapBox), used on the "Cerca" screen
// when VITE_MAPBOX_TOKEN is set — otherwise MapScreen keeps the hand-drawn SVG.
// Lazy-loaded (see MapScreen), so mapbox-gl (~230KB) only downloads when this
// screen actually opens with a token. Styled dark-v11 + a warm CSS tint toward
// Mesa's oxblood (see map-gl.css); pins are DOM markers so the existing brass
// pin language carries over.
export default function MapGL({
  spots,
  me,
  token,
  onSelect,
}: {
  spots: MapSpot[]
  me: LatLng | null
  token: string
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Latest onSelect without re-creating the map when the parent re-renders.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!containerRef.current || spots.length === 0) return
    mapboxgl.accessToken = token

    // Fit the initial view to everything we're plotting (spots + you), same
    // intent as the SVG projection's bounds. One spot → a sensible zoom.
    const lats = spots.map((s) => s.lat)
    const lngs = spots.map((s) => s.lng)
    if (me) {
      lats.push(me.lat)
      lngs.push(me.lng)
    }
    const bounds = new mapboxgl.LngLatBounds(
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    )

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      bounds,
      fitBoundsOptions: { padding: 48, maxZoom: 16 },
      attributionControl: true,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    const markers: mapboxgl.Marker[] = []
    for (const s of spots) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `map-gl-pin${s.friendCount > 0 ? ' map-gl-pin--hot' : ''}`
      el.setAttribute('aria-label', s.name)
      el.addEventListener('click', () => onSelectRef.current(s.id))
      markers.push(new mapboxgl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map))
    }
    if (me) {
      const meEl = document.createElement('div')
      meEl.className = 'map-gl-me'
      markers.push(new mapboxgl.Marker({ element: meEl }).setLngLat([me.lng, me.lat]).addTo(map))
    }

    return () => {
      for (const m of markers) m.remove()
      map.remove()
    }
  }, [spots, me, token])

  return <div ref={containerRef} className="map-gl" aria-label="Mapa de spots en Santo Domingo" />
}
