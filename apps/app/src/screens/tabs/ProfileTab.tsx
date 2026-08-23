import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { useProfile } from '../../hooks/useProfile'
import { api, apiOrigin } from '../../lib/api'
import { resizeToJpeg } from '../../lib/image'
import type { MeStats, Neighborhood } from '../../lib/types'
import './tabs.css'
import './rankings.css'
import './profile.css'

// The user's own profile (Phase 6 mock E1): centered identity, a stats trio,
// edit/share, routes into the lists, and the two gamified stat cards (rank +
// streak). The top bar (name + share + settings) is the profile TopBar variant.
export function ProfileTab() {
  const queryClient = useQueryClient()
  const { data } = useProfile(true)
  const p = data?.profile
  const [editing, setEditing] = useState(false)

  const stats = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => api.get<MeStats>('/me/stats'),
  })

  const fileInput = useRef<HTMLInputElement>(null)
  const setAvatar = useMutation({
    mutationFn: (image: string) => api.patch('/me/avatar', { image }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })
  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file)
      setAvatar.mutate(await resizeToJpeg(file, { maxEdge: 192, square: true, quality: 0.8 }))
    e.target.value = ''
  }

  async function shareProfile() {
    const link = p?.handle ? `${apiOrigin}/p/u/${p.handle}` : apiOrigin
    if (navigator.share)
      await navigator.share({ text: `Mi ranking en Mesa 🥂\n${link}` }).catch(() => {})
    else await navigator.clipboard.writeText(link).catch(() => {})
  }

  if (editing) {
    return <EditProfile onClose={() => setEditing(false)} />
  }

  const memberSince =
    p?.createdAt &&
    new Date(p.createdAt).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })
  const barrio = p?.neighborhood?.name

  return (
    <div className="profile-e1">
      <div className="profile-hero profile-hero--center">
        <button
          type="button"
          className="avatar-btn avatar-btn--center"
          onClick={() => fileInput.current?.click()}
          aria-label="Cambiar foto"
        >
          <Avatar name={p?.name || p?.handle || 'm'} src={p?.image} size={88} />
          <span className="avatar-btn__hint">{setAvatar.isPending ? '…' : '+ foto'}</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onPickAvatar}
        />
        {p?.handle && <div className="profile-handle">@{p.handle}</div>}
        <div className="profile-since">
          {[memberSince && `Miembro desde ${memberSince}`, barrio].filter(Boolean).join(' · ')}
        </div>
      </div>

      {stats.data && (
        <div className="stats-row stats-row--trio">
          <div className="stat">
            <span className="stat__n">{stats.data.followers}</span>
            <span className="stat__l">Seguidores</span>
          </div>
          <div className="stat">
            <span className="stat__n">{stats.data.following}</span>
            <span className="stat__l">Siguiendo</span>
          </div>
          <div className="stat">
            <span className="stat__n">
              {stats.data.rankInDr != null ? `#${stats.data.rankInDr}` : '—'}
            </span>
            <span className="stat__l">Rank en RD</span>
          </div>
        </div>
      )}

      <div className="profile-actions">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Editar perfil
        </Button>
        <Button variant="secondary" onClick={shareProfile}>
          Compartir perfil
        </Button>
      </div>

      <div className="profile-nav">
        <Link to="/rankings" className="profile-nav__row">
          <span className="profile-nav__label">✓ Rankeados</span>
          <span className="profile-nav__meta">{stats.data?.places ?? 0} ›</span>
        </Link>
        <Link to="/rankings" search={{ tab: 'saved' }} className="profile-nav__row">
          <span className="profile-nav__label">◇ Quiero probar</span>
          <span className="profile-nav__meta">›</span>
        </Link>
        <Link to="/explore" className="profile-nav__row">
          <span className="profile-nav__label">♡ Recomendados para ti</span>
          <span className="profile-nav__meta">›</span>
        </Link>
      </div>

      {stats.data && (
        <div className="profile-statcards">
          <div className="statcard">
            <span className="statcard__label">Rank en RD</span>
            <span className="statcard__value">
              {stats.data.rankInDr != null ? `#${stats.data.rankInDr}` : '—'}
            </span>
          </div>
          <div className="statcard">
            <span className="statcard__label">Racha actual</span>
            <span className="statcard__value">
              {stats.data.streakWeeks > 0
                ? `${stats.data.streakWeeks} semana${stats.data.streakWeeks > 1 ? 's' : ''}`
                : 'Aún ninguna'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Minimal edit sheet — name, @handle, neighbourhood, bio → PATCH /me/profile.
function EditProfile({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data } = useProfile(true)
  const p = data?.profile
  const [name, setName] = useState(p?.name ?? '')
  const [handle, setHandle] = useState(p?.handle ?? '')
  const [bio, setBio] = useState(p?.bio ?? '')
  const [slug, setSlug] = useState<string>('')
  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  // Default the neighbourhood select to the current one once slugs load.
  const currentSlug =
    slug ||
    neighborhoods.data?.neighborhoods.find((n) => n.name === p?.neighborhood?.name)?.slug ||
    ''

  const save = useMutation({
    mutationFn: () =>
      api.patch('/me/profile', {
        name: name.trim(),
        handle: handle.trim().replace(/^@/, '') || undefined,
        neighborhoodSlug: currentSlug,
        bio: bio.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      onClose()
    },
  })
  const canSave = name.trim().length > 0 && currentSlug.length > 0 && !save.isPending

  return (
    <div className="profile-edit">
      <button type="button" className="link-action" onClick={onClose}>
        ‹ Editar perfil
      </button>
      <label className="profile-edit__field">
        <span className="profile-edit__label">Nombre</span>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />
      </label>
      <label className="profile-edit__field">
        <span className="profile-edit__label">@usuario</span>
        <input
          className="field"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="tuusuario"
          maxLength={30}
        />
      </label>
      <label className="profile-edit__field">
        <span className="profile-edit__label">Sector</span>
        <select className="field" value={currentSlug} onChange={(e) => setSlug(e.target.value)}>
          <option value="" disabled>
            ¿Dónde sales?
          </option>
          {neighborhoods.data?.neighborhoods.map((n) => (
            <option key={n.slug} value={n.slug}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <label className="profile-edit__field">
        <span className="profile-edit__label">Bio</span>
        <input
          className="field"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={120}
        />
      </label>
      {save.error && (
        <div className="error-text">No se pudo guardar — prueba con otro usuario.</div>
      )}
      <div className="spacer" />
      <Button disabled={!canSave} onClick={() => save.mutate()}>
        {save.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </div>
  )
}
