import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Group, NavRow, Row } from '@/components/SettingsRow'
import { Button, Caption, MAX_SCALE } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { CalendarIcon, CheckIcon, LockIcon, MailIcon, RotateIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { ApiError, api } from '@/lib/api'
import { authClient, signOut } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/authErrors'
import { dateLocale, useT } from '@/lib/i18n'
import { parseBirthdayIso } from '@/lib/time'

// Account (M15) — email verification, password, ending other sessions, and
// account deletion. Moved verbatim out of the old flat app/settings.tsx. Redesign 2: icon rows in
// one grouped card (the inline forms open inside it), and the danger zone a ringed r22 panel.
export default function AccountSettings() {
  const router = useRouter()
  const t = useT()
  const queryClient = useQueryClient()
  const { data } = useProfile(true)
  const p = data?.profile

  // Real email only — phone-first accounts carry a placeholder inbox we never
  // surface or ask to verify.
  const realEmail = p?.email && !p.email.endsWith('@phone.mesa.local') ? p.email : null

  // Birthday (M23) — private, account settings only, never the public
  // profile or followers (see PATCH /me/birthday's own header). Mandatory
  // at signup going forward, but nullable here too: every account that
  // predates M23 has none yet and can set one for the first time from here.
  const [editingBirthday, setEditingBirthday] = useState(false)
  const [birthDay, setBirthDay] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const birthdayIso = useMemo(
    () => parseBirthdayIso(birthDay, birthMonth, birthYear),
    [birthDay, birthMonth, birthYear],
  )
  const birthdayLabel = p?.birthday
    ? new Intl.DateTimeFormat(dateLocale(), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${p.birthday}T00:00:00Z`))
    : null
  const saveBirthday = useMutation({
    mutationFn: () => api.patch('/me/birthday', { birthday: birthdayIso }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setEditingBirthday(false)
      setBirthDay('')
      setBirthMonth('')
      setBirthYear('')
      toast({ message: t('settings.birthday_updated') })
    },
    onError: (err) => {
      const underAge = err instanceof ApiError && err.code === 'under_age'
      toast({
        variant: 'error',
        message: t(underAge ? 'settings.birthday_under_age' : 'settings.birthday_error'),
      })
    },
  })

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
      // The server has already erased the account and its sessions and push tokens.
      await signOut({ local: true }).catch(() => {})
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
        contentContainerClassName="px-4 pb-12"
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <Group className="mt-3">
          {realEmail && (
            <Row>
              <MailIcon size={18} />
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="min-w-0 flex-1 font-ui text-body text-text"
                numberOfLines={1}
              >
                {realEmail}
              </Text>
              {p?.emailVerified ? (
                <View className="flex-row items-center gap-1">
                  <Caption>{t('settings.verified')}</Caption>
                  <CheckIcon size={14} color="text-muted" strokeWidth={2.2} />
                </View>
              ) : verifySent ? (
                <Caption>{t('settings.link_sent')}</Caption>
              ) : (
                <Pressable
                  hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                  accessibilityRole="button"
                  disabled={verifying}
                  onPress={resendVerification}
                  className="min-h-[36px] justify-center active:opacity-60"
                >
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="font-ui-semibold text-label text-accent"
                  >
                    {verifying ? t('settings.sending') : t('settings.verify_email')}
                  </Text>
                </Pressable>
              )}
            </Row>
          )}

          {/* Birthday (M23) — private, account settings only (see the
              header comment above and PATCH /me/birthday's own). Mandatory
              at signup going forward, but every pre-M23 account has none yet
              and sets it here for the first time. */}
          {editingBirthday ? (
            <View className="gap-3 border-line border-b py-4">
              <View className="flex-row gap-2">
                <View className="w-[72px]">
                  <Field
                    onCard
                    className="text-center"
                    placeholder={t('onboarding.birthday_day')}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={birthDay}
                    onChangeText={(v) => setBirthDay(v.replace(/\D/g, ''))}
                  />
                </View>
                <View className="w-[72px]">
                  <Field
                    onCard
                    className="text-center"
                    placeholder={t('onboarding.birthday_month')}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={birthMonth}
                    onChangeText={(v) => setBirthMonth(v.replace(/\D/g, ''))}
                  />
                </View>
                <View className="w-[104px]">
                  <Field
                    onCard
                    className="text-center"
                    placeholder={t('onboarding.birthday_year')}
                    keyboardType="number-pad"
                    maxLength={4}
                    value={birthYear}
                    onChangeText={(v) => setBirthYear(v.replace(/\D/g, ''))}
                  />
                </View>
              </View>
              {birthDay.length > 0 &&
                birthMonth.length > 0 &&
                birthYear.length === 4 &&
                !birthdayIso && (
                  <Caption className="text-danger">{t('onboarding.birthday_invalid')}</Caption>
                )}
              <Button
                variant="primary"
                loading={saveBirthday.isPending}
                disabled={!birthdayIso}
                onPress={() => saveBirthday.mutate()}
              >
                {saveBirthday.isPending ? t('common.saving') : t('settings.save_birthday')}
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setEditingBirthday(false)
                  setBirthDay('')
                  setBirthMonth('')
                  setBirthYear('')
                }}
              >
                {t('common.cancel')}
              </Button>
            </View>
          ) : (
            <NavRow
              icon={<CalendarIcon size={18} />}
              label={t('onboarding.birthday_label')}
              meta={birthdayLabel ?? t('settings.birthday_not_set')}
              onPress={() => setEditingBirthday(true)}
            />
          )}

          {/* Change password — only for accounts that HAVE one. An Apple or
              phone account has no password, and offering it would be a
              control that can only fail. */}
          {realEmail &&
            (changingPassword ? (
              <View className="gap-3 border-line border-b py-4">
                <Field
                  onCard
                  placeholder={t('settings.current_password_placeholder')}
                  secureTextEntry
                  textContentType="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
                <Field
                  onCard
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
              <NavRow
                icon={<LockIcon size={18} />}
                label={t('settings.change_password')}
                onPress={() => setChangingPassword(true)}
              />
            ))}

          {/* The control people look for after a scare: end every OTHER
              session. */}
          <NavRow
            icon={<RotateIcon size={18} />}
            label={
              revokeOthers.isPending
                ? t('settings.signing_out_others')
                : t('settings.sign_out_others')
            }
            onPress={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
            chevron={false}
            last
          />
        </Group>

        {/* Danger zone — in-app account deletion (App Store 5.1.1). */}
        <View className="mt-4 gap-3 rounded-group border-[1.5px] border-danger p-4">
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui-semibold text-label text-danger"
          >
            {t('settings.danger_zone')}
          </Text>
          {!confirmingDelete ? (
            <>
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui text-pill leading-[20px] text-text-2"
              >
                {t('settings.delete_account_warning')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmingDelete(true)}
                className="min-h-[44px] items-center justify-center rounded-pill border-[1.5px] border-danger active:opacity-70"
              >
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-semibold text-subhead text-danger"
                >
                  {t('settings.delete_account')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui text-pill leading-[20px] text-text-2"
              >
                {realEmail
                  ? t('settings.delete_confirm_with_password')
                  : t('settings.delete_confirm_no_password')}
              </Text>
              {realEmail && (
                <Field
                  onCard
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
