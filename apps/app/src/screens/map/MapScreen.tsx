import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Body, ErrorState, Eyebrow, SerifItalic, Title } from '../../components/ui'
import { api } from '../../lib/api'
import { displayScore, priceLabel } from '../../lib/display'
import { cloudinaryUrl } from '../../lib/media'
import type { MapSpot } from '../../lib/types'
import '../tabs/tabs.css'
import './map.css'

// A barrio map of Santo Domingo — every spot plotted from its real lat/lng, the
// ones people you follow have ranked lit brass. Self-contained SVG: no map
// library, no token, works offline and in the native webview. (A MapBox street
// layer can slot in later when a token is configured; the data endpoint already
// returns coordinates.) Tap a pin → a card with the friends' average and a way
// into the spot.

const VW = 360
const PAD = 26

interface Placed extends MapSpot {
  x: number
  y: number
}

interface Projection {
  placed: Placed[]
  vh: number // viewBox height, sized to the data so there's no dead space
}

// Equirectangular projection: fit the spots to the fixed width (longitude
// corrected by latitude so the city isn't stretched), then let the viewBox
// height follow the data's own aspect ratio. Santo Domingo's upscale strip is
// far wider east–west than north–south, so this keeps the frame from being
// half-empty. Clamped to a sane band for degenerate spreads.
function project(spots: MapSpot[]): Projection {
  if (spots.length === 0) return { placed: [], vh: 260 }
  const lats = spots.map((s) => s.lat)
  const lngs = spots.map((s) => s.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRad = (((minLat + maxLat) / 2) * Math.PI) / 180
  const geoW = Math.max((maxLng - minLng) * Math.cos(latRad), 1e-6)
  const geoH = Math.max(maxLat - minLat, 1e-6)
  const scale = (VW - 2 * PAD) / geoW
  const contentH = geoH * scale
  const vh = Math.min(460, Math.max(220, contentH + 2 * PAD))
  const offY = (vh - contentH) / 2
  const placed = spots.map((s) => ({
    ...s,
    x: PAD + (s.lng - minLng) * Math.cos(latRad) * scale,
    y: offY + (maxLat - s.lat) * scale, // north up
  }))
  return { placed, vh }
}

// One label per neighborhood, at the centroid of its plotted spots.
function neighborhoodLabels(placed: Placed[]) {
  const groups = new Map<string, { x: number; y: number; n: number }>()
  for (const p of placed) {
    if (!p.neighborhood) continue
    const g = groups.get(p.neighborhood) ?? { x: 0, y: 0, n: 0 }
    groups.set(p.neighborhood, { x: g.x + p.x, y: g.y + p.y, n: g.n + 1 })
  }
  return [...groups.entries()].map(([name, g]) => ({ name, x: g.x / g.n, y: g.y / g.n }))
}

function pinRadius(friendCount: number): number {
  return 2.6 + Math.min(friendCount, 5) * 0.7
}

export function MapScreen() {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['map'],
    queryFn: () => api.get<{ spots: MapSpot[] }>('/restaurants/map'),
    staleTime: 120_000,
  })

  const spots = q.data?.spots ?? []
  const { placed, vh } = useMemo(() => project(spots), [spots])
  const labels = useMemo(() => neighborhoodLabels(placed), [placed])
  const selected = placed.find((p) => p.id === selectedId) ?? null
  const rankedByFriends = placed.filter((p) => p.friendCount > 0).length

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <ScreenHeader onBack={() => navigate({ to: '/discover' })} backLabel="Back" />
        <div className="tab-header">
          <Eyebrow>Santo Domingo</Eyebrow>
          <Title>El mapa</Title>
          {rankedByFriends > 0 && (
            <Body style={{ color: 'var(--accent)' }}>
              {rankedByFriends} spot{rankedByFriends === 1 ? '' : 's'} tus amigos han rankeado.
            </Body>
          )}
        </div>

        {q.isPending ? (
          <Body>Cargando el mapa…</Body>
        ) : q.isError ? (
          <ErrorState>No se pudo cargar el mapa. Intenta de nuevo.</ErrorState>
        ) : placed.length === 0 ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Aún no hay spots.</SerifItalic>
          </div>
        ) : (
          <div className="map-frame">
            <svg
              className="map-canvas"
              viewBox={`0 0 ${VW} ${vh}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="Mapa de spots en Santo Domingo"
            >
              <title>Mapa de spots en Santo Domingo</title>
              {/* faint framing rings for depth */}
              <defs>
                <radialGradient id="mapGlow" cx="50%" cy="42%" r="60%">
                  <stop offset="0%" className="map-glow-from" />
                  <stop offset="100%" className="map-glow-to" />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width={VW} height={vh} rx="16" fill="url(#mapGlow)" />

              {labels.map((l) => (
                <text key={l.name} className="map-label" x={l.x} y={l.y - 14} textAnchor="middle">
                  {l.name}
                </text>
              ))}

              {placed.map((p) => {
                const isSel = p.id === selectedId
                const hot = p.friendCount > 0
                return (
                  <g
                    key={p.id}
                    className="map-pin"
                    onClick={() => setSelectedId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedId(p.id)
                      }
                    }}
                    tabIndex={0}
                    aria-label={p.name}
                  >
                    {/* Transparent hit target — enlarges the tap area well beyond
                        the 3–6px dot. Capped short of a full 44px so adjacent pins
                        in dense barrios stay individually tappable. */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={pinRadius(p.friendCount) + 11}
                      className="map-pin__hit"
                    />
                    {isSel && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={pinRadius(p.friendCount) + 6}
                        className="map-pin__halo"
                      />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={pinRadius(p.friendCount)}
                      className={hot ? 'map-pin__dot map-pin__dot--hot' : 'map-pin__dot'}
                    />
                  </g>
                )
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Selection card — slides up when a pin is tapped. */}
      {selected && (
        <button
          type="button"
          className="map-scrim"
          aria-label="Cerrar"
          onClick={() => setSelectedId(null)}
        />
      )}
      {selected && <SpotCard spot={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

function SpotCard({ spot, onClose }: { spot: Placed; onClose: () => void }) {
  const thumb = cloudinaryUrl(spot.coverImageId, { w: 200, h: 200 })
  const meta = [spot.cuisine, spot.neighborhood, priceLabel(spot.priceTier)]
    .filter(Boolean)
    .join(' · ')
  // Hand off to the OS maps app for turn-by-turn from the user's location.
  // Google's universal link deep-links to the Google Maps app on device and
  // falls back to Apple Maps / the browser when it isn't installed.
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`
  return (
    <div className="map-card">
      {thumb ? (
        <img className="map-card__thumb" src={thumb} alt="" loading="lazy" />
      ) : (
        <div className="map-card__thumb" />
      )}
      <div className="map-card__main">
        <div className="map-card__name">{spot.name}</div>
        <div className="map-card__meta">{meta}</div>
        <div className="map-card__signal">
          {spot.friendCount > 0 ? (
            <>
              <span className="map-card__avg">{displayScore(spot.friendAvg ?? 0)}</span>
              <span className="map-card__label">
                {spot.friendCount} amig{spot.friendCount === 1 ? 'o' : 'os'} · promedio
              </span>
            </>
          ) : (
            <span className="map-card__label">Nadie que sigues lo ha rankeado aún.</span>
          )}
        </div>
      </div>
      <div className="map-card__actions">
        <a
          className="map-card__dir"
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
        >
          Cómo llegar
        </a>
        <Link
          to="/r/$restaurantId"
          params={{ restaurantId: spot.id }}
          className="map-card__go"
          onClick={onClose}
        >
          Ver →
        </Link>
      </div>
    </div>
  )
}
