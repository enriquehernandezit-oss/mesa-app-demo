import { Body, Button, Caption, Eyebrow, SerifItalic, Wordmark } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { authClient } from '@/lib/auth-client'
import { useT } from '@/lib/i18n'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, type TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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
    const { error: err } = await authClient.resetPassword({ newPassword: password, token })
    setBusy(false)
    if (err) return setError(err.message ?? t('auth.reset_invalid_link'))
    setDone(true)
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center gap-5 px-5"
      >
        <View className="items-center gap-2">
          <Wordmark size={56} />
          <Eyebrow>{t('auth.reset_title')}</Eyebrow>
        </View>

        {!token ? (
          <View className="gap-3">
            <SerifItalic className="text-serif-sm text-center">
              {t('auth.reset_missing_token')}
            </SerifItalic>
            <Body className="text-center text-text-2">{t('auth.reset_missing_token_body')}</Body>
            <Button variant="primary" onPress={goSignIn}>
              {t('auth.reset_back_to_signin')}
            </Button>
          </View>
        ) : done ? (
          <View className="gap-3">
            <SerifItalic className="text-serif-md text-center">{t('auth.reset_done')}</SerifItalic>
            <Button variant="primary" onPress={goSignIn}>
              {t('auth.sign_in_button')}
            </Button>
          </View>
        ) : (
          <View className="gap-3">
            <Field
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
              <Caption className="text-status-packed">{t('auth.reset_mismatch')}</Caption>
            )}
            {error && <Caption className="text-status-packed">{error}</Caption>}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
