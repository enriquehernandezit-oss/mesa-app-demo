import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Suspense, lazy, useMemo, useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Body, EmptyState, ErrorState, Eyebrow, Title } from '../../components/ui'
import { PlaceCover } from '../../components/ui/PlaceCover'
import { api } from '../../lib/api'
import { cuisineLabel, displayScore, priceLabel } from '../../lib/display'
import type { LatLng } from '../../lib/geo'
import { openNavChooser } from '../../lib/navChooser'
import type { MapSpot } from '../../lib/types'
import { useBack } from '../../lib/useBack'
import { useMyLocation } from '../../lib/useMyLocation'
import '../tabs/tabs.css'
import './map.css'

// A barrio map of Santo Domingo — every spot plotted from its real lat/lng, the
// ones people you follow have ranked lit brass. Two renderers: when
// VITE_MAPBOX_TOKEN is set, the real pannable MapBox street map (lazy-loaded
// MapGL); otherwise the self-contained SVG below — no library, no token, works
// offline and in the native webview. Either way, tapping a pin opens the same
// card with the friends' average and a way into the spot.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
const MapGL = lazy(() => import('./MapGL'))

const VW = 360
const PAD = 26

interface Placed extends MapSpot {
  x: number
  y: number
}

interface Projection {
  placed: Placed[]
  vh: number // viewBox height, sized to the data so there's no dead space
  me: { x: number; y: number } | null
}

// Equirectangular projection: fit the spots to the fixed width (longitude
// corrected by latitude so the city isn't stretched), then let the viewBox
// height follow the data's own aspect ratio. Santo Domingo's upscale strip is
// far wider east–west than north–south, so this keeps the frame from being
// half-empty. Clamped to a sane band for degenerate spreads.
//
// `me` (the device's real position, once known) is folded into the SAME
// bounds as the restaurants before the scale is computed — not projected
// separately against the restaurants' own bounds — so "you are here" is
// always inside the viewBox even if the user is a bit outside the usual
// restaurant cluster, instead of silently landing off-canvas.
function project(spots: MapSpot[], me: LatLng | null): Projection {
  if (spots.length === 0) return { placed: [], vh: 260, me: null }
  const lats = spots.map((s) => s.lat)
  const lngs = spots.map((s) => s.lng)
  if (me) {
    lats.push(me.lat)
    lngs.push(me.lng)
  }
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
  const toXY = (p: LatLng) => ({
    x: PAD + (p.lng - minLng) * Math.cos(latRad) * scale,
    y: offY + (maxLat - p.lat) * scale, // north up
  })
  const placed = spots.map((s) => ({ ...s, ...toXY(s) }))
  return { placed, vh, me: me ? toXY(me) : null }
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
  const goBack = useBack(() => navigate({ to: '/discover' }))
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['map'],
    queryFn: () => api.get<{ spots: MapSpot[] }>('/restaurants/map'),
    staleTime: 120_000,
  })

  const { position: myPosition } = useMyLocation()

  const spots = q.data?.spots ?? []
  const { placed, vh, me } = useMemo(() => project(spots, myPosition), [spots, myPosition])
  const labels = useMemo(() => neighborhoodLabels(placed), [placed])
  // Selection reads from spots (a MapSpot), so it works for both renderers.
  const selected = spots.find((s) => s.id === selectedId) ?? null
  const rankedByFriends = spots.filter((s) => s.friendCount > 0).length

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <ScreenHeader onBack={goBack} backLabel="Atrás" />
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
          <ErrorState onRetry={() => q.refetch()}>No se pudo cargar el mapa.</ErrorState>
        ) : placed.length === 0 ? (
          <EmptyState>Aún no hay spots.</EmptyState>
        ) : MAPBOX_TOKEN ? (
          <Suspense fallback={<Body>Cargando el mapa…</Body>}>
            <MapGL spots={spots} me={myPosition} token={MAPBOX_TOKEN} onSelect={setSelectedId} />
          </Suspense>
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

              {me && (
                <g aria-hidden className="map-me">
                  <circle cx={me.x} cy={me.y} r="9" className="map-me__halo" />
                  <circle cx={me.x} cy={me.y} r="3.4" className="map-me__dot" />
                </g>
              )}

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

function SpotCard({ spot, onClose }: { spot: MapSpot; onClose: () => void }) {
  const meta = [cuisineLabel(spot.cuisine), spot.neighborhood, priceLabel(spot.priceTier)]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="map-card">
      <PlaceCover
        seed={spot.id}
        name={spot.name}
        coverImageId={spot.coverImageId}
        size={{ w: 200, h: 200 }}
        className="map-card__thumb"
      />
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
        <button
          type="button"
          className="map-card__dir"
          onClick={() =>
            openNavChooser({ kind: 'coords', lat: spot.lat, lng: spot.lng, label: spot.name })
          }
        >
          Cómo llegar
        </button>
        <Link
          to="/r/$restaurantId"
          params={{ restaurantId: spot.id }}
          className="map-card__go"
          onClick={onClose}
        >
          Ver ›
        </Link>
      </div>
    </div>
  )
}
