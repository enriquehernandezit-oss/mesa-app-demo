import { Row, RowButton } from '@/components/SettingsRow'
import { Button, Caption, Eyebrow } from '@/components/ui'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { ApiError, api } from '@/lib/api'
import { authClient, signOut } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/authErrors'
import { useT } from '@/lib/i18n'
import { useColor } from '@/theme/useColor'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'

// Tu cuenta (M15) — email verification, password, ending other sessions, and
// account deletion. Moved verbatim out of the old flat app/settings.tsx.
export default function AccountSettings() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const t = useT()
  const placeholder = useColor('text-muted')
  const { data } = useProfile(true)
  const p = data?.profile

  // Real email only — phone-first accounts carry a placeholder inbox we never
  // surface or ask to verify.
  const realEmail = p?.email && !p.email.endsWith('@phone.mesa.local') ? p.email : null

  const [verifySent, setVerifySent] = useState(false)
  const [verifying, setVerifying] = useState(false)
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
        message: authErrorMessage(res.error, t('settings.email_send_error')),
      })
      return
    }
    setVerifySent(true)
  }

  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  // revokeOtherSessions is on by default: if you're changing your password
  // because you think someone else has it, leaving their session alive
  // defeats the point.
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
      toast({ message: t('settings.password_updated') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        message: authErrorMessage(
          err as { code?: string; status?: number },
          t('settings.change_password_error'),
        ),
      }),
  })

  const revokeOthers = useMutation({
    mutationFn: async () => {
      const res = await authClient.revokeOtherSessions()
      if (res.error) throw res.error
    },
    onSuccess: () => toast({ message: t('settings.other_sessions_ended') }),
    onError: (err) =>
      toast({
        variant: 'error',
        message: authErrorMessage(
          err as { code?: string; status?: number },
          t('settings.revoke_sessions_error'),
        ),
      }),
  })

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  // Deletion is irreversible and support cannot undo it, so the server demands
  // proof of identity: the password where the account has one, otherwise a
  // recently-created session.
  const deleteAccount = useMutation({
    mutationFn: () => api.del('/me', { password: deletePassword || undefined }),
    onSuccess: async () => {
      await signOut().catch(() => {})
      router.replace('/sign-in')
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : ''
      toast({
        variant: 'error',
        message:
          code === 'invalid_password'
            ? t('settings.wrong_password')
            : code === 'password_required'
              ? t('settings.password_required_confirm')
              : code === 'session_not_fresh'
                ? t('settings.session_not_fresh_delete')
                : t('settings.delete_error'),
      })
    },
  })

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-12"
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <View className="mt-4 rounded border border-line bg-surface px-4">
          {realEmail && (
            <Row>
              <Text className="flex-1 font-ui text-body text-text" numberOfLines={1}>
                {realEmail}
              </Text>
              {p?.emailVerified ? (
                <Caption>{t('settings.verified')}</Caption>
              ) : verifySent ? (
                <Caption>{t('settings.link_sent')}</Caption>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={verifying}
                  onPress={resendVerification}
                  className="min-h-[36px] justify-center active:opacity-60"
                >
                  <Text className="font-ui-medium text-label text-accent-strong">
                    {verifying ? t('settings.sending') : t('settings.verify_email')}
                  </Text>
                </Pressable>
              )}
            </Row>
          )}

          {/* Change password — only for accounts that HAVE one. An Apple or
              phone account has no password, and offering it would be a
              control that can only fail. */}
          {realEmail &&
            (changingPassword ? (
              <View className="gap-3 py-4">
                <TextInput
                  className="min-h-[48px] rounded border border-line bg-bg px-4 font-ui text-body text-text"
                  placeholderTextColor={placeholder}
                  placeholder={t('settings.current_password_placeholder')}
                  secureTextEntry
                  textContentType="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
                <TextInput
                  className="min-h-[48px] rounded border border-line bg-bg px-4 font-ui text-body text-text"
                  placeholderTextColor={placeholder}
                  placeholder={t('settings.new_password_placeholder')}
                  secureTextEntry
                  textContentType="newPassword"
                  passwordRules="minlength: 8;"
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
                  {changePassword.isPending ? t('common.saving') : t('settings.save_password')}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    setChangingPassword(false)
                    setCurrentPassword('')
                    setNewPassword('')
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </View>
            ) : (
              <RowButton onPress={() => setChangingPassword(true)}>
                <Text className="flex-1 font-ui text-body text-text">
                  {t('settings.change_password')}
                </Text>
              </RowButton>
            ))}

          {/* The control people look for after a scare: end every OTHER
              session. */}
          <RowButton onPress={() => revokeOthers.mutate()} disabled={revokeOthers.isPending} last>
            <Text className="flex-1 font-ui text-body text-text">
              {revokeOthers.isPending
                ? t('settings.signing_out_others')
                : t('settings.sign_out_others')}
            </Text>
          </RowButton>
        </View>

        {/* Danger zone — in-app account deletion (App Store 5.1.1). */}
        <View className="mt-8 gap-3 rounded border border-status-packed p-4">
          <Eyebrow className="text-status-packed">{t('settings.danger_zone')}</Eyebrow>
          {!confirmingDelete ? (
            <>
              <Caption>{t('settings.delete_account_warning')}</Caption>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmingDelete(true)}
                className="min-h-[44px] items-center justify-center rounded border border-status-packed active:opacity-70"
              >
                <Text className="font-ui-medium text-label text-status-packed">
                  {t('settings.delete_account')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Caption>
                {realEmail
                  ? t('settings.delete_confirm_with_password')
                  : t('settings.delete_confirm_no_password')}
              </Caption>
              {realEmail && (
                <TextInput
                  className="min-h-[48px] rounded border border-line bg-bg px-4 font-ui text-body text-text"
                  placeholderTextColor={placeholder}
                  placeholder={t('settings.your_password_placeholder')}
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
                {deleteAccount.isPending
                  ? t('settings.deleting')
                  : t('settings.delete_confirm_button')}
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setConfirmingDelete(false)
                  setDeletePassword('')
                }}
              >
                {t('common.cancel')}
              </Button>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
