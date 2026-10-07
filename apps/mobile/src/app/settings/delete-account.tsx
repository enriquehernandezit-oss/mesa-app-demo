import { useMutation } from '@tanstack/react-query'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Body, Button, Caption, MAX_SCALE, Serif } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { ApiError, api } from '@/lib/api'
import { authClient, signOut } from '@/lib/auth-client'
import { useT } from '@/lib/i18n'
import { resetToSignIn } from '@/lib/resetToSignIn'

// Deleting the account (App Store 5.1.1): its own page, reached from the row under Sign out in Settings,
// so it reads as a decision and not as a button someone tapped while scrolling. Plain words about what goes.
// The member closed Apple's confirmation sheet — nothing to report.
class DeleteCancelled extends Error {}

export default function DeleteAccount() {
  const router = useRouter()
  const t = useT()
  const { data } = useProfile(true)
  const p = data?.profile

  // Has a password to ask for: the API says so; an older one did not, and the email was the guess. (An
  // Apple or Google account with a real email has none — asking it for one was a dead end.)
  const realEmail = p?.email && !p.email.endsWith('@phone.mesa.local') ? p.email : null
  const hasPassword = p?.hasPassword ?? Boolean(realEmail)
  const hasApple = Boolean(p?.hasApple)

  const [password, setPassword] = useState('')
  // Forgot it: the reset email is the way back. Resetting ends every session (auth.ts), so the member
  // signs in again with the new password and comes back here — the copy says so.
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  async function sendReset() {
    if (!realEmail || resetState === 'sending') return
    setResetState('sending')
    const res = await authClient
      .requestPasswordReset({ email: realEmail, redirectTo: '/reset-password' })
      .catch(() => ({ error: { message: 'network' } }))
    setResetState('error' in res && res.error ? 'error' : 'sent')
  }
  // Deletion is irreversible and support cannot undo it, so the server demands proof of identity: the
  // password where the account has one, an Apple confirmation for an Apple account, otherwise a
  // recently-created session.
  const deleteAccount = useMutation({
    mutationFn: async () => {
      // An Apple account asks Apple again (a fresh sheet): that is the proof of identity, and the code it
      // returns lets the server revoke Mesa's grant on the member's Apple ID (App Store 5.1.1(v)).
      let appleAuthorizationCode: string | undefined
      if (hasApple && (await AppleAuthentication.isAvailableAsync().catch(() => false))) {
        try {
          const cred = await AppleAuthentication.signInAsync({ requestedScopes: [] })
          appleAuthorizationCode = cred.authorizationCode ?? undefined
        } catch (err) {
          // Closing the Apple sheet is a change of mind, not a failure.
          if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED')
            throw new DeleteCancelled()
          throw err
        }
      }
      return api.del('/me', { password: password || undefined, appleAuthorizationCode })
    },
    onSuccess: async () => {
      // The server has already erased the account and its sessions and push tokens.
      await signOut({ local: true }).catch(() => {})
      resetToSignIn(router)
    },
    onError: (err) => {
      if (err instanceof DeleteCancelled) return
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
        contentContainerClassName="px-5 pb-12 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <Serif className="text-serif-lg text-text">{t('settings.delete_title')}</Serif>
        <Body className="mt-3 text-text-2">{t('settings.delete_intro')}</Body>
        <Body className="mt-3 text-text-2">
          {hasPassword
            ? t('settings.delete_confirm_with_password')
            : hasApple
              ? t('settings.delete_confirm_apple')
              : t('settings.delete_confirm_no_password')}
        </Body>

        <View className="mt-5 gap-3">
          {hasPassword && (
            <Field
              placeholder={t('settings.your_password_placeholder')}
              secureTextEntry
              textContentType="password"
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
            />
          )}
          {hasPassword && realEmail ? (
            resetState === 'sent' ? (
              <Caption>{t('settings.delete_reset_sent', { email: realEmail })}</Caption>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={resetState === 'sending'}
                  onPress={sendReset}
                  className="min-h-[40px] justify-center self-start active:opacity-60"
                >
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="font-ui-semibold text-label text-accent"
                  >
                    {resetState === 'sending' ? t('settings.sending') : t('auth.forgot_password')}
                  </Text>
                </Pressable>
                {resetState === 'error' ? (
                  <Caption className="text-danger">{t('settings.delete_reset_error')}</Caption>
                ) : null}
              </>
            )
          ) : null}
          <Button
            variant="destructive"
            loading={deleteAccount.isPending}
            disabled={hasPassword && !password}
            onPress={() => deleteAccount.mutate()}
          >
            {deleteAccount.isPending ? t('settings.deleting') : t('settings.delete_confirm_button')}
          </Button>
          <Button variant="ghost" onPress={() => router.back()}>
            {t('common.cancel')}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}
