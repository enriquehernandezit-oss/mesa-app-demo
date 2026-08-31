import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Button, Caption, Eyebrow, Toggle } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { ThemePicker } from '../../components/ui/ThemePicker'
import { toast } from '../../components/ui/toast-store'
import { useProfile } from '../../hooks/useProfile'
import { ApiError, api } from '../../lib/api'
import { authClient, signOut } from '../../lib/auth-client'
import { authErrorEs } from '../../lib/authErrors'
import { comingSoon } from '../../lib/comingSoon'
import { getFriendsOnlyScores, setFriendsOnlyScores } from '../../lib/prefs'
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
    onError: () =>
      toast({ variant: 'error', message: 'No se pudo desbloquear. Intenta de nuevo.' }),
  })
  const blocked = blocks.data?.blocked ?? []

  const stats = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => api.get<MeStats>('/me/stats'),
  })

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [exporting, setExporting] = useState(false)
  const [verifySent, setVerifySent] = useState(false)
  const [verifying, setVerifying] = useState(false)
  // Client-only "Your list" pref (mock H1): friends-only genuinely hides the
  // all-of-Mesa aggregate score. (Stealth is inert-by-design — see its row.)
  const [friendsOnly, setFriendsOnly] = useState(getFriendsOnlyScores)

  // Real email only — phone-first accounts carry a placeholder inbox we never
  // surface or ask to verify.
  const realEmail = p?.email && !p.email.endsWith('@phone.mesa.local') ? p.email : null

  async function resendVerification() {
    if (!realEmail || verifying) return
    setVerifying(true)
    // The client RESOLVES with { error } rather than throwing, so the catch
    // below only ever caught a network rejection — a rejected send still ran
    // setVerifySent(true) and the UI claimed "Enlace enviado" for mail that was
    // never sent, which is exactly what the old comment said it prevented.
    const res = await authClient
      .sendVerificationEmail({ email: realEmail, callbackURL: '/verify-email' })
      .catch(() => ({ error: { message: 'network' } }))
    setVerifying(false)
    if (res && 'error' in res && res.error) {
      toast({
        variant: 'error',
        message: authErrorEs(res.error, 'No se pudo enviar el correo. Intenta de nuevo.'),
      })
      return
    }
    setVerifySent(true)
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

  // Deletion is irreversible and support cannot undo it, so the server now
  // demands proof of identity: the password where the account has one, and
  // otherwise a recently-created session.
  const deleteAccount = useMutation({
    mutationFn: () => api.del('/me', { password: deletePassword || undefined }),
    onSuccess: async () => {
      await signOut().catch(() => {})
      queryClient.clear()
      window.location.href = '/'
    },
    // Without this the button just re-enables and the account looks deleted-ish
    // — the worst possible ambiguity for an irreversible action.
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : ''
      toast({
        variant: 'error',
        message:
          code === 'invalid_password'
            ? 'Esa contraseña no es correcta.'
            : code === 'password_required'
              ? 'Escribe tu contraseña para confirmar.'
              : code === 'session_not_fresh'
                ? 'Por seguridad, cierra sesión y vuelve a entrar antes de eliminar la cuenta.'
                : 'No se pudo eliminar la cuenta. Intenta de nuevo.',
      })
    },
  })

  // Changing your password had no UI at all — the endpoint existed and nothing
  // called it. revokeOtherSessions is on by default here: if you are changing
  // it because you think someone else has it, leaving their session alive is
  // the one outcome that defeats the point.
  const changePassword = useMutation({
    mutationFn: async () => {
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (res.error) throw res.error
    },
    onSuccess: () => {
      setChangingPassword(false)
      setCurrentPassword('')
      setNewPassword('')
      toast({ message: 'Contraseña actualizada. Cerramos las otras sesiones.' })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        message: authErrorEs(err as { code?: string; status?: number }, 'No se pudo cambiar.'),
      }),
  })

  // "Sign out everywhere else" — the control people look for after a scare.
  const revokeOthers = useMutation({
    mutationFn: async () => {
      const res = await authClient.revokeOtherSessions()
      if (res.error) throw res.error
    },
    onSuccess: () => toast({ message: 'Cerramos la sesión en los demás dispositivos.' }),
    onError: (err) =>
      toast({
        variant: 'error',
        message: authErrorEs(
          err as { code?: string; status?: number },
          'No se pudo cerrar las otras sesiones.',
        ),
      }),
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
          {/* Inert-by-design (the app's dashed data-stale pattern, as used by
              the reserve slots): stealth only ever wrote to localStorage — the
              server does nothing with it, so a member flipping it was NOT
              hidden from anyone. A privacy control that lies is worse than one
              that says "pronto", so it announces itself until the backend
              enforces it. */}
          <button
            type="button"
            className="settings-row settings-row--btn"
            data-stale
            aria-disabled
            onClick={() => comingSoon('El modo sigiloso llega pronto a Mesa.')}
          >
            <span>Modo sigiloso</span>
            <span className="settings-row__soon">Pronto</span>
          </button>
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

          {/* Change password. Only for accounts that HAVE one — an Apple or
              phone account has no password to change, and offering it would be
              a control that can only fail. */}
          {realEmail &&
            (changingPassword ? (
              <form
                className="stack stack--tight"
                style={{ padding: 'var(--space-3) 0' }}
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newPassword.length >= 8 && !changePassword.isPending) changePassword.mutate()
                }}
              >
                <label className="sr-only" htmlFor="set-current-password">
                  Contraseña actual
                </label>
                <input
                  id="set-current-password"
                  className="field"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Contraseña actual"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <label className="sr-only" htmlFor="set-new-password">
                  Contraseña nueva
                </label>
                <input
                  id="set-new-password"
                  className="field"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Nueva contraseña (8+ caracteres)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button
                  type="submit"
                  aria-busy={changePassword.isPending}
                  disabled={changePassword.isPending || newPassword.length < 8 || !currentPassword}
                >
                  {changePassword.isPending ? 'Guardando…' : 'Guardar contraseña'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setChangingPassword(false)
                    setCurrentPassword('')
                    setNewPassword('')
                  }}
                >
                  Cancelar
                </Button>
              </form>
            ) : (
              <button
                type="button"
                className="settings-row settings-row--btn"
                onClick={() => setChangingPassword(true)}
              >
                <span>Cambiar contraseña</span>
              </button>
            ))}

          {/* The control people look for after a scare: end every OTHER session
              without touching this one. */}
          <button
            type="button"
            className="settings-row settings-row--btn"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate()}
          >
            <span>
              {revokeOthers.isPending ? 'Cerrando…' : 'Cerrar sesión en otros dispositivos'}
            </span>
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
              <Caption>
                {realEmail
                  ? '¿Estás seguro? Escribe tu contraseña para confirmar. Esto borra todo y no se puede deshacer.'
                  : '¿Estás seguro? Esto borra todo y no se puede deshacer.'}
              </Caption>
              <div className="stack stack--tight">
                {realEmail && (
                  <>
                    <label className="sr-only" htmlFor="delete-password">
                      Contraseña
                    </label>
                    <input
                      id="delete-password"
                      className="field"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Tu contraseña"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="danger-btn danger-btn--solid"
                  onClick={() => deleteAccount.mutate()}
                  disabled={deleteAccount.isPending || (Boolean(realEmail) && !deletePassword)}
                >
                  {deleteAccount.isPending ? 'Eliminando…' : 'Sí, eliminar todo'}
                </button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setConfirmingDelete(false)
                    setDeletePassword('')
                  }}
                >
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
