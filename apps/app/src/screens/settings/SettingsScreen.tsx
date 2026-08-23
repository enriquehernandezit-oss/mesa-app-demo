import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Button, Caption, Eyebrow, Toggle } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { ThemePicker } from '../../components/ui/ThemePicker'
import { useProfile } from '../../hooks/useProfile'
import { ApiError, api } from '../../lib/api'
import { authClient, signOut } from '../../lib/auth-client'
import { comingSoon } from '../../lib/comingSoon'
import {
  getFriendsOnlyScores,
  getStealthMode,
  setFriendsOnlyScores,
  setStealthMode,
} from '../../lib/prefs'
import type { BlockedUser, MeStats, Ranking } from '../../lib/types'
import { useBack } from '../../lib/useBack'
import '../tabs/tabs.css'
import '../tabs/profile.css'
import './settings.css'

// Settings (Phase 6) — the home for appearance, data, and account controls that
// used to sit loose at the bottom of Profile. Reached from the Profile gear; the
// legal copy points here ("Profile → settings"). Full-screen, no tab bar.
export function SettingsScreen() {
  const navigate = useNavigate()
  const goBack = useBack(() => navigate({ to: '/profile' }))
  const queryClient = useQueryClient()
  const { data } = useProfile(true)
  const p = data?.profile

  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ blocked: BlockedUser[] }>('/moderation/blocks'),
  })
  const unblock = useMutation({
    mutationFn: (userId: string) => api.del(`/moderation/blocks/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocks'] }),
  })
  const blocked = blocks.data?.blocked ?? []

  const stats = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => api.get<MeStats>('/me/stats'),
  })

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [verifySent, setVerifySent] = useState(false)
  const [verifying, setVerifying] = useState(false)
  // Client-only "Your list" prefs (mock H1). Friends-only is real (it hides the
  // all-of-Mesa score); stealth persists but is inert.
  const [friendsOnly, setFriendsOnly] = useState(getFriendsOnlyScores)
  const [stealth, setStealth] = useState(getStealthMode)

  // Real email only — phone-first accounts carry a placeholder inbox we never
  // surface or ask to verify.
  const realEmail = p?.email && !p.email.endsWith('@phone.mesa.local') ? p.email : null

  async function resendVerification() {
    if (!realEmail || verifying) return
    setVerifying(true)
    try {
      await authClient.sendVerificationEmail({ email: realEmail, callbackURL: '/' })
      setVerifySent(true)
    } finally {
      setVerifying(false)
    }
  }

  // Phone/OAuth-first accounts (no real email) can add email + password sign-in.
  const [linkEmail, setLinkEmail] = useState('')
  const [linkPassword, setLinkPassword] = useState('')
  const linkCredential = useMutation({
    mutationFn: () =>
      api.post('/me/link-email', { email: linkEmail.trim(), password: linkPassword }),
    onSuccess: () => {
      setLinkEmail('')
      setLinkPassword('')
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
  const linkError =
    linkCredential.error instanceof ApiError && linkCredential.error.code === 'email_taken'
      ? 'Ese correo ya está en uso.'
      : linkCredential.isError
        ? 'No se pudo agregar el inicio de sesión — intenta de nuevo.'
        : null

  async function handleSignOut() {
    await signOut()
    queryClient.clear()
    window.location.href = '/'
  }

  const deleteAccount = useMutation({
    mutationFn: () => api.del('/me'),
    onSuccess: async () => {
      await signOut().catch(() => {})
      queryClient.clear()
      window.location.href = '/'
    },
  })

  // Export — your ranked list as JSON, straight from the existing endpoint. No
  // new API; the data is yours to take.
  async function exportRankings() {
    if (exporting) return
    setExporting(true)
    try {
      const res = await api.get<{ rankings: Ranking[] }>('/rankings')
      const blob = new Blob([JSON.stringify(res.rankings, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mesa-rankings.json'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <ScreenHeader onBack={goBack} backLabel="Ajustes" />

        {/* Tappable profile card → /profile. */}
        <Link to="/profile" className="settings-id settings-id--link">
          <Avatar name={p?.name || p?.handle || 'm'} src={p?.image} size={44} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="settings-id__name">{p?.name || 'Tú'}</div>
            <div className="settings-id__meta">
              {[p?.handle ? `@${p.handle}` : null, `${stats.data?.places ?? 0} rankeados`]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <span className="settings-row__meta">›</span>
        </Link>

        {/* Appearance. */}
        <Eyebrow className="settings-eyebrow">Apariencia</Eyebrow>
        <ThemePicker />

        {/* Your list. */}
        <Eyebrow className="settings-eyebrow">Tu lista</Eyebrow>
        <div className="settings-group">
          <div className="settings-row">
            <span>Puntuaciones solo de amigos</span>
            <Toggle
              checked={friendsOnly}
              onChange={(v) => {
                setFriendsOnly(v)
                setFriendsOnlyScores(v)
                queryClient.invalidateQueries({ queryKey: ['restaurant'] })
              }}
              label="Puntuaciones solo de amigos"
            />
          </div>
          <div className="settings-row">
            <span>Modo sigiloso</span>
            <Toggle
              checked={stealth}
              onChange={(v) => {
                setStealth(v)
                setStealthMode(v)
              }}
              label="Modo sigiloso"
            />
          </div>
          <button
            type="button"
            className="settings-row settings-row--btn"
            onClick={exportRankings}
            disabled={exporting}
          >
            <span>Exportar mis rankings</span>
            <span className="settings-row__meta">{exporting ? '…' : '›'}</span>
          </button>
        </div>

        {/* Blocked accounts (App Store 1.2). */}
        {blocked.length > 0 && (
          <>
            <Eyebrow className="settings-eyebrow">Cuentas bloqueadas</Eyebrow>
            <div className="settings-group">
              {blocked.map((u) => (
                <div key={u.id} className="settings-row">
                  <span>{u.name || (u.handle ? `@${u.handle}` : 'Alguien')}</span>
                  <button
                    type="button"
                    className="link-action"
                    onClick={() => unblock.mutate(u.id)}
                    disabled={unblock.isPending}
                  >
                    Desbloquear
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Add email sign-in — phone/OAuth-first accounts with no real email. */}
        {p && !realEmail && (
          <>
            <Eyebrow className="settings-eyebrow">Agregar inicio con correo</Eyebrow>
            <div className="settings-linkform">
              <Caption>
                Agrega un correo y contraseña para poder iniciar sesión sin tu teléfono.
              </Caption>
              <input
                className="field"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="tu@correo.com"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
              />
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                placeholder="Contraseña (8+ caracteres)"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
              />
              <Button
                disabled={
                  linkCredential.isPending || !linkEmail.includes('@') || linkPassword.length < 8
                }
                onClick={() => linkCredential.mutate()}
              >
                {linkCredential.isPending ? 'Agregando…' : 'Agregar correo y contraseña'}
              </Button>
              {linkError && <div className="error-text">{linkError}</div>}
            </div>
          </>
        )}

        {/* Account. */}
        <Eyebrow className="settings-eyebrow">Cuenta</Eyebrow>
        <div className="settings-group">
          {/* Notifications + Invites are inert-by-design (no backend yet). */}
          <button
            type="button"
            className="settings-row settings-row--btn"
            data-stale
            aria-disabled
            onClick={() => comingSoon('Las notificaciones llegan pronto a Mesa.')}
          >
            <span>Notificaciones</span>
            <span className="settings-row__meta">›</span>
          </button>
          <button
            type="button"
            className="settings-row settings-row--btn"
            data-stale
            aria-disabled
            onClick={() => comingSoon('Las invitaciones llegan pronto a Mesa.')}
          >
            <span>Invitaciones</span>
            <span className="settings-row__meta settings-row__meta--mono">4 restantes</span>
          </button>
          {realEmail && (
            <div className="settings-row">
              <span className="settings-row__email">{realEmail}</span>
              {p?.emailVerified ? (
                <span className="settings-row__meta">Verificado ✓</span>
              ) : verifySent ? (
                <span className="settings-row__meta">Enlace enviado ›</span>
              ) : (
                <button
                  type="button"
                  className="link-action"
                  onClick={resendVerification}
                  disabled={verifying}
                >
                  {verifying ? 'Enviando…' : 'Verificar correo'}
                </button>
              )}
            </div>
          )}
          <a className="settings-row settings-row--link" href="/privacy">
            <span>Política de Privacidad</span>
            <span className="settings-row__meta">›</span>
          </a>
          <a className="settings-row settings-row--link" href="/terms">
            <span>Términos</span>
            <span className="settings-row__meta">›</span>
          </a>
          <a className="settings-row settings-row--link" href="/eula">
            <span>EULA</span>
            <span className="settings-row__meta">›</span>
          </a>
          <button
            type="button"
            className="settings-row settings-row--btn settings-row--accent"
            onClick={handleSignOut}
          >
            <span>Cerrar sesión</span>
          </button>
        </div>

        {/* Danger zone — in-app account deletion (App Store 5.1.1). */}
        <div className="danger-zone">
          <Eyebrow style={{ color: 'var(--status-packed)' }}>Zona de peligro</Eyebrow>
          {!confirmingDelete ? (
            <>
              <Caption>
                Eliminar tu cuenta borra permanentemente tus rankings, notas, follows y perfil. Esto
                no se puede deshacer.
              </Caption>
              <button
                type="button"
                className="danger-btn"
                onClick={() => setConfirmingDelete(true)}
              >
                Eliminar cuenta
              </button>
            </>
          ) : (
            <>
              <Caption>¿Estás seguro? Esto borra todo y no se puede deshacer.</Caption>
              <div className="stack stack--tight">
                <button
                  type="button"
                  className="danger-btn danger-btn--solid"
                  onClick={() => deleteAccount.mutate()}
                  disabled={deleteAccount.isPending}
                >
                  {deleteAccount.isPending ? 'Eliminando…' : 'Sí, eliminar todo'}
                </button>
                <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
