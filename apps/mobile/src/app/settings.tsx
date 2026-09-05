import { Button, Caption, Eyebrow, Toggle } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { ThemePicker } from '@/components/ui/ThemePicker'
import { ChevronIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { ApiError, api } from '@/lib/api'
import { authClient, signOut } from '@/lib/auth-client'
import { authErrorEs } from '@/lib/authErrors'
import { comingSoon } from '@/lib/comingSoon'
import { captureError } from '@/lib/errors'
import { setFriendsOnlyScores, useFriendsOnlyScores } from '@/lib/prefs'
import { shareInviteLink } from '@/lib/shareProfile'
import type { BlockedUser, MeStats, Ranking } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { File, Paths } from 'expo-file-system'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native'

// Settings (Phase 6) — appearance, data, and the account lifecycle. Reached from
// the Profile gear. Ported from apps/app/src/screens/settings/SettingsScreen.tsx.
// Native deltas: the export writes a JSON file and opens the share sheet (no
// blob download); legal pages are in-app routes; sign-out/delete land on the
// gate via router.replace instead of a hard location change.
export default function SettingsScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const placeholder = useColor('text-muted')
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

  const stats = useQuery({ queryKey: ['me-stats'], queryFn: () => api.get<MeStats>('/me/stats') })

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [exporting, setExporting] = useState(false)
  const [inviting, setInviting] = useState(false)

  // How many people actually joined through your link. Only shown once it's
  // non-zero — "0 se unieron" is a scoreboard nobody asked for.
  const inviteStats = useQuery({
    queryKey: ['invite-stats'],
    queryFn: () => api.get<{ joined: number }>('/invites/me/stats'),
  })

  // The invite link, fetched on demand (the code is created server-side on
  // first ask, so an account that never shares never gets a row).
  async function shareInvite() {
    if (inviting) return
    setInviting(true)
    try {
      const { code } = await api.get<{ code: string }>('/invites/me')
      await shareInviteLink(code)
      inviteStats.refetch()
    } catch (err) {
      captureError(err, 'invite.share')
      toast({ variant: 'error', message: 'No se pudo crear tu invitación.' })
    } finally {
      setInviting(false)
    }
  }
  const [verifySent, setVerifySent] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const friendsOnly = useFriendsOnlyScores()

  // Real email only — phone-first accounts carry a placeholder inbox we never
  // surface or ask to verify.
  const realEmail = p?.email && !p.email.endsWith('@phone.mesa.local') ? p.email : null

  async function resendVerification() {
    if (!realEmail || verifying) return
    setVerifying(true)
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

  async function handleSignOut() {
    await signOut()
    queryClient.clear()
    router.replace('/')
  }

  // Deletion is irreversible and support cannot undo it, so the server demands
  // proof of identity: the password where the account has one, otherwise a
  // recently-created session.
  const deleteAccount = useMutation({
    mutationFn: () => api.del('/me', { password: deletePassword || undefined }),
    onSuccess: async () => {
      await signOut().catch(() => {})
      queryClient.clear()
      router.replace('/')
    },
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

  // revokeOtherSessions is on by default: if you're changing your password
  // because you think someone else has it, leaving their session alive defeats
  // the point.
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

  // Export — your ranked list as JSON. The web downloaded a blob; native writes
  // the file to the cache and hands it to the share sheet, so it can go to Files,
  // Mail, anywhere. The data is yours to take either way.
  async function exportRankings() {
    if (exporting) return
    setExporting(true)
    try {
      const res = await api.get<{ rankings: Ranking[] }>('/rankings')
      const file = new File(Paths.cache, 'mesa-rankings.json')
      // create({ overwrite }) so a second export doesn't fail on the leftover.
      file.create({ overwrite: true })
      file.write(JSON.stringify(res.rankings, null, 2))
      await Share.share({ url: file.uri, message: 'Mis rankings de Mesa' })
    } catch {
      toast({ variant: 'error', message: 'No se pudo exportar. Intenta de nuevo.' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-12"
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        {/* Tappable profile card → the profile tab. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/profile')}
          className="flex-row items-center gap-3 rounded border border-line bg-surface p-3 active:opacity-80"
        >
          <Avatar name={p?.name || p?.handle || 'm'} src={p?.image} size={44} />
          <View className="min-w-0 flex-1">
            <Text className="font-serif text-serif-md text-text" numberOfLines={1}>
              {p?.name || 'Tú'}
            </Text>
            <Caption numberOfLines={1}>
              {[p?.handle ? `@${p.handle}` : null, `${stats.data?.places ?? 0} rankeados`]
                .filter(Boolean)
                .join(' · ')}
            </Caption>
          </View>
          <ChevronIcon size={16} color="text-faint" />
        </Pressable>

        <Eyebrow className="mt-6 mb-2">Apariencia</Eyebrow>
        <ThemePicker />

        <Eyebrow className="mt-6 mb-2">Tu lista</Eyebrow>
        <View className="rounded border border-line bg-surface px-4">
          <Row>
            <Text className="flex-1 font-ui text-body text-text">Puntuaciones solo de amigos</Text>
            <Toggle
              checked={friendsOnly}
              onChange={(v) => {
                setFriendsOnlyScores(v)
                queryClient.invalidateQueries({ queryKey: ['restaurant'] })
              }}
              label="Puntuaciones solo de amigos"
            />
          </Row>
          {/* "Modo sigiloso" removed rather than left as "Pronto". It first
              shipped as a local flag that hid nothing from anyone, then became a
              promise with no date — and what "private" should even mean here
              (hidden from the feed? the leaderboard? non-followers?) is an
              undecided product question. Blocking already delivers the concrete
              case. A control returns when it works, not before. */}
          <RowButton onPress={exportRankings} disabled={exporting} last>
            <Text className="flex-1 font-ui text-body text-text">Exportar mis rankings</Text>
            {exporting ? (
              <Caption className="font-mono text-micro">…</Caption>
            ) : (
              <ChevronIcon size={16} color="text-faint" />
            )}
          </RowButton>
        </View>

        {/* Blocked accounts (App Store 1.2). */}
        {blocked.length > 0 && (
          <>
            <Eyebrow className="mt-6 mb-2">Cuentas bloqueadas</Eyebrow>
            <View className="rounded border border-line bg-surface px-4">
              {blocked.map((u, i) => (
                <Row key={u.id} last={i === blocked.length - 1}>
                  <Text className="flex-1 font-ui text-body text-text">
                    {u.name || (u.handle ? `@${u.handle}` : 'Alguien')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={unblock.isPending}
                    onPress={() => unblock.mutate(u.id)}
                    className="min-h-[36px] justify-center active:opacity-60"
                  >
                    <Text className="font-ui-medium text-label text-accent-strong">
                      Desbloquear
                    </Text>
                  </Pressable>
                </Row>
              ))}
            </View>
          </>
        )}

        <Eyebrow className="mt-6 mb-2">Cuenta</Eyebrow>
        <View className="rounded border border-line bg-surface px-4">
          {/* Notifications + invites are inert-by-design (no backend yet). */}
          <RowButton onPress={() => comingSoon('Las notificaciones llegan pronto a Mesa.')}>
            <Text className="flex-1 font-ui text-body text-text-muted">Notificaciones</Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
          {/* Was a `comingSoon` toast next to a fake "4 restantes" counter —
              invented scarcity for a feature that didn't exist. Invites are
              real now, unlimited, and gate nothing; the only number shown is
              how many people actually joined. */}
          <RowButton onPress={shareInvite} disabled={inviting}>
            <Text className="flex-1 font-ui text-body text-text">Invitar amigos</Text>
            {inviteStats.data && inviteStats.data.joined > 0 ? (
              <Caption className="font-mono text-micro">
                {inviteStats.data.joined} {inviteStats.data.joined === 1 ? 'se unió' : 'se unieron'}
              </Caption>
            ) : (
              <ChevronIcon size={16} color="text-faint" />
            )}
          </RowButton>
          {realEmail && (
            <Row>
              <Text className="flex-1 font-ui text-body text-text" numberOfLines={1}>
                {realEmail}
              </Text>
              {p?.emailVerified ? (
                <Caption className="font-mono">Verificado ✓</Caption>
              ) : verifySent ? (
                <Caption className="font-mono">Enlace enviado ›</Caption>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={verifying}
                  onPress={resendVerification}
                  className="min-h-[36px] justify-center active:opacity-60"
                >
                  <Text className="font-ui-medium text-label text-accent-strong">
                    {verifying ? 'Enviando…' : 'Verificar correo'}
                  </Text>
                </Pressable>
              )}
            </Row>
          )}
          {/* Only moderators see this row, and the screen re-checks anyway —
              the flag is set directly in the DB, never granted in-product. */}
          {p?.isModerator ? (
            <RowButton onPress={() => router.push('/moderation')}>
              <Text className="flex-1 font-ui text-body text-text">Moderación</Text>
              <ChevronIcon size={16} color="text-faint" />
            </RowButton>
          ) : null}
          <RowButton onPress={() => router.push('/legal/privacy')}>
            <Text className="flex-1 font-ui text-body text-text">Política de Privacidad</Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
          <RowButton onPress={() => router.push('/legal/terms')}>
            <Text className="flex-1 font-ui text-body text-text">Términos</Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
          <RowButton onPress={() => router.push('/legal/eula')}>
            <Text className="flex-1 font-ui text-body text-text">EULA</Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
          <RowButton onPress={handleSignOut}>
            <Text className="flex-1 font-ui-medium text-body text-accent-strong">
              Cerrar sesión
            </Text>
          </RowButton>

          {/* Change password — only for accounts that HAVE one. An Apple or phone
              account has no password, and offering it would be a control that can
              only fail. */}
          {realEmail &&
            (changingPassword ? (
              <View className="gap-3 py-4">
                <TextInput
                  className="min-h-[48px] rounded border border-line bg-bg px-4 font-ui text-body text-text"
                  placeholderTextColor={placeholder}
                  placeholder="Contraseña actual"
                  secureTextEntry
                  textContentType="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
                <TextInput
                  className="min-h-[48px] rounded border border-line bg-bg px-4 font-ui text-body text-text"
                  placeholderTextColor={placeholder}
                  placeholder="Nueva contraseña (8+ caracteres)"
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <Button
                  variant="primary"
                  loading={changePassword.isPending}
                  disabled={newPassword.length < 8 || !currentPassword}
                  onPress={() => changePassword.mutate()}
                >
                  {changePassword.isPending ? 'Guardando…' : 'Guardar contraseña'}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    setChangingPassword(false)
                    setCurrentPassword('')
                    setNewPassword('')
                  }}
                >
                  Cancelar
                </Button>
              </View>
            ) : (
              <RowButton onPress={() => setChangingPassword(true)}>
                <Text className="flex-1 font-ui text-body text-text">Cambiar contraseña</Text>
              </RowButton>
            ))}

          {/* The control people look for after a scare: end every OTHER session. */}
          <RowButton onPress={() => revokeOthers.mutate()} disabled={revokeOthers.isPending} last>
            <Text className="flex-1 font-ui text-body text-text">
              {revokeOthers.isPending ? 'Cerrando…' : 'Cerrar sesión en otros dispositivos'}
            </Text>
          </RowButton>
        </View>

        {/* Danger zone — in-app account deletion (App Store 5.1.1). */}
        <View className="mt-8 gap-3 rounded border border-status-packed p-4">
          <Eyebrow className="text-status-packed">Zona de peligro</Eyebrow>
          {!confirmingDelete ? (
            <>
              <Caption>
                Eliminar tu cuenta borra permanentemente tus rankings, notas, follows y perfil. Esto
                no se puede deshacer.
              </Caption>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmingDelete(true)}
                className="min-h-[44px] items-center justify-center rounded border border-status-packed active:opacity-70"
              >
                <Text className="font-ui-medium text-label text-status-packed">
                  Eliminar cuenta
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Caption>
                {realEmail
                  ? '¿Estás seguro? Escribe tu contraseña para confirmar. Esto borra todo y no se puede deshacer.'
                  : '¿Estás seguro? Esto borra todo y no se puede deshacer.'}
              </Caption>
              {realEmail && (
                <TextInput
                  className="min-h-[48px] rounded border border-line bg-bg px-4 font-ui text-body text-text"
                  placeholderTextColor={placeholder}
                  placeholder="Tu contraseña"
                  secureTextEntry
                  textContentType="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                />
              )}
              <Button
                variant="destructive"
                loading={deleteAccount.isPending}
                disabled={Boolean(realEmail) && !deletePassword}
                onPress={() => deleteAccount.mutate()}
              >
                {deleteAccount.isPending ? 'Eliminando…' : 'Sí, eliminar todo'}
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setConfirmingDelete(false)
                  setDeletePassword('')
                }}
              >
                Cancelar
              </Button>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

function Row({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <View
      className={`min-h-[52px] flex-row items-center gap-3 py-3 ${last ? '' : 'border-line border-b'}`}
    >
      {children}
    </View>
  )
}

function RowButton({
  children,
  onPress,
  disabled,
  last,
}: { children: ReactNode; onPress: () => void; disabled?: boolean; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center gap-3 py-3 active:opacity-70 ${last ? '' : 'border-line border-b'}`}
    >
      {children}
    </Pressable>
  )
}
