import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Body, Button, Caption, Serif, Wordmark } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { LockIcon } from '@/components/ui/icons'
import { ApiError, api } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/authErrors'
import { useT } from '@/lib/i18n'

// Reached from the password-reset email (a universal link →
// /reset-password?token=…, or the mesa:// scheme). Renders outside the auth gate
// so a signed-out member can complete it. Collects a new password and calls
// resetPassword. Ported from apps/app/src/screens/auth/ResetPassword.tsx.
export default function ResetPassword() {
  const t = useT()
  const { token } = useLocalSearchParams<{ token?: string }>()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const confirmRef = useRef<TextInput>(null)

  const goSignIn = () => router.replace('/sign-in')

  async function submit() {
    if (!token) return
    setError(null)
    setBusy(true)
    // Ask the API about the password first: Better Auth spends the emailed link before it checks the
    // breach list, so a breached password used to cost the member their link. An API from before this
    // check exists answers 404 — carry on as it always did.
    let verdict: 'breached' | 'clean' | 'unknown' | 'invalid_link' = 'clean'
    try {
      verdict = (
        await api.post<{ result: typeof verdict }>('/p/reset-password/check', { token, password })
      ).result
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        setBusy(false)
        return setError(
          authErrorMessage(
            { status: err instanceof ApiError ? err.status : 0 },
            t('auth.reset_check_failed'),
          ),
        )
      }
    }
    if (verdict !== 'clean') {
      setBusy(false)
      if (verdict === 'breached') return setError(t('auth.PASSWORD_COMPROMISED'))
      if (verdict === 'unknown') return setError(t('auth.reset_check_failed'))
      return setError(t('auth.reset_invalid_link'))
    }
    // `.catch`: offline, the client throws instead of returning { error } and `busy` stayed true, so
    // the button sat on "…" for good. And the message goes through the translations rather than the
    // library's English.
    const res = await authClient
      .resetPassword({ newPassword: password, token })
      .catch(() => ({ error: { code: undefined, message: undefined, status: 0 } }))
    setBusy(false)
    if (res.error) return setError(authErrorMessage(res.error, t('auth.reset_invalid_link')))
    setDone(true)
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Closing the keyboard: tap anywhere outside the fields, or drag the
            form down. It used to be a fixed View where only the keyboard's own
            return key could dismiss it. `handled` keeps a tap on a button or
            field working on the first try. */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Pressable
            accessible={false}
            onPress={Keyboard.dismiss}
            className="flex-grow justify-center gap-5 px-5 py-6"
          >
            <View className="items-center gap-2">
              <Wordmark size={56} />
              <Serif className="mt-3 text-center text-serif-lg text-text">
                {t('auth.reset_title')}
              </Serif>
            </View>

            {!token ? (
              <View className="gap-3">
                <Serif className="text-serif-sm text-center">{t('auth.reset_missing_token')}</Serif>
                <Body className="text-center text-text-2">
                  {t('auth.reset_missing_token_body')}
                </Body>
                <Button variant="primary" onPress={goSignIn}>
                  {t('auth.reset_back_to_signin')}
                </Button>
              </View>
            ) : done ? (
              <View className="gap-3">
                <Serif className="text-serif-md text-center">{t('auth.reset_done')}</Serif>
                <Button variant="primary" onPress={goSignIn}>
                  {t('auth.sign_in_button')}
                </Button>
              </View>
            ) : (
              <View className="gap-3">
                <Field
                  icon={<LockIcon size={18} color="text-muted" />}
                  placeholder={t('auth.reset_new_password_placeholder')}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  passwordRules="minlength: 8;"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  value={password}
                  onChangeText={setPassword}
                />
                <Field
                  ref={confirmRef}
                  icon={<LockIcon size={18} color="text-muted" />}
                  placeholder={t('auth.reset_confirm_placeholder')}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  passwordRules="minlength: 8;"
                  returnKeyType="go"
                  enablesReturnKeyAutomatically
                  onSubmitEditing={() => {
                    if (!busy && password.length >= 8 && password === confirm) submit()
                  }}
                  value={confirm}
                  onChangeText={setConfirm}
                />
                <Button
                  variant="primary"
                  disabled={busy || password.length < 8 || password !== confirm}
                  onPress={submit}
                >
                  {busy ? '…' : t('auth.reset_save_button')}
                </Button>
                {password.length > 0 && confirm.length > 0 && password !== confirm && (
                  <Caption className="text-danger">{t('auth.reset_mismatch')}</Caption>
                )}
                {error && <Caption className="text-danger">{error}</Caption>}
              </View>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
