import mapboxgl from 'mapbox-gl'
import { useEffect, useRef } from 'react'
import type { LatLng } from '../../lib/geo'
import { MAP_STYLE_ID } from '../../lib/media'
import type { MapSpot } from '../../lib/types'
import { useResolvedTheme } from '../../lib/useResolvedTheme'
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
  className,
  center,
  highlightId,
}: {
  spots: MapSpot[]
  me: LatLng | null
  token: string
  onSelect: (id: string) => void
  // Lets a caller (the profile's map sheet) size the map differently without
  // MapGL knowing anything about that screen.
  className?: string
  // Fixed view instead of fit-to-bounds. Fitting one point is a degenerate
  // box, which snaps to max zoom and shows rooftops with no street names —
  // useless for orienting. A single-place map wants a chosen zoom.
  center?: { lat: number; lng: number; zoom: number }
  // The spot this map is *about*, drawn as the accent pin. On the browse map
  // no single spot is the subject, so nothing is highlighted there.
  highlightId?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  // Latest onSelect without re-creating the map when the parent re-renders.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!containerRef.current || spots.length === 0) return
    mapboxgl.accessToken = token

    // A caller-chosen view wins; otherwise fit to everything we're plotting
    // (spots + you), the same intent as the SVG projection's bounds.
    let view: Omit<mapboxgl.MapOptions, 'container'>
    if (center) {
      view = { center: [center.lng, center.lat], zoom: center.zoom }
    } else {
      const lats = spots.map((s) => s.lat)
      const lngs = spots.map((s) => s.lng)
      if (me) {
        lats.push(me.lat)
        lngs.push(me.lng)
      }
      view = {
        bounds: new mapboxgl.LngLatBounds(
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ),
        fitBoundsOptions: { padding: 48, maxZoom: 16 },
      }
    }

    const map = new mapboxgl.Map({
      ...view,
      container: containerRef.current,
      style: `mapbox://styles/mapbox/${MAP_STYLE_ID[theme]}`,
      attributionControl: true,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    const markers: mapboxgl.Marker[] = []
    for (const s of spots) {
      const el = document.createElement('button')
      el.type = 'button'
      // Accent pin when this spot is the subject of the map, or when friends
      // have ranked it on the browse map; quiet ink otherwise.
      const hot = s.id === highlightId || s.friendCount > 0
      el.className = `map-gl-pin${hot ? ' map-gl-pin--hot' : ''}`
      el.setAttribute('aria-label', s.name)
      el.addEventListener('click', () => onSelectRef.current(s.id))
      markers.push(new mapboxgl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map))
    }
    if (me) {
      const meEl = document.createElement('div')
      meEl.className = 'map-gl-me'
      markers.push(new mapboxgl.Marker({ element: meEl }).setLngLat([me.lng, me.lat]).addTo(map))
    }

    // mapbox-gl measures its container once at construction. When the map is
    // built inside a surface that is still animating in (the profile's map
    // sheet transitions translateY + opacity), that measurement is of the
    // pre-settle box, and tiles render for only part of the canvas — the map
    // comes up half blank. Re-measuring on any container resize fixes that,
    // and covers rotation and split-view for free.
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      for (const m of markers) m.remove()
      map.remove()
    }
  }, [spots, me, token, theme, center, highlightId])

  return (
    <div
      ref={containerRef}
      className={['map-gl', className].filter(Boolean).join(' ')}
      aria-label="Mapa de spots en Santo Domingo"
    />
  )
}
