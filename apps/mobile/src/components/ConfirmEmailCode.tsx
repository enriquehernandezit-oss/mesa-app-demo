import { useEffect, useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Body, Button, Caption, MAX_SCALE, Serif, Wordmark } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { track } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/authErrors'
import { EMAIL_CODE_LENGTH, codeDigits } from '@/lib/emailConfirm'
import { useT } from '@/lib/i18n'
import { queryClient } from '@/lib/query'

// The screen between "Crear cuenta" and the app for an email + password sign-up: the server mailed a
// 6-digit code, and typing it proves the address is theirs. A correct code also signs them in (the
// server answers with the session token, which lib/auth-client.ts stores), so there is no second
// sign-in. Apple and Google accounts never see it — those providers vouch for the address.
const RESEND_SECONDS = 30
const NETWORK_ERROR = { message: 'network' }

type Failure = { code?: string; message?: string; status?: number }

export function ConfirmEmailCode({ email, onBack }: { email: string; onBack: () => void }) {
  const t = useT()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The server mails at most 3 codes a minute; a visible wait is kinder than a 429.
  const [wait, setWait] = useState(RESEND_SECONDS)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function confirm(value: string) {
    if (busy || value.length !== EMAIL_CODE_LENGTH) return
    setError(null)
    setNotice(null)
    setBusy(true)
    const res = await authClient.emailOtp
      .verifyEmail({ email, otp: value })
      .catch(() => ({ error: NETWORK_ERROR }))
    setBusy(false)
    if ('error' in res && res.error) {
      const failure = res.error as Failure
      setCode('')
      // Three wrong guesses spend the code; saying so beats "wait a moment".
      setError(
        failure.code === 'TOO_MANY_ATTEMPTS'
          ? t('auth.confirm_spent')
          : authErrorMessage(failure, t('auth.fallback')),
      )
      return
    }
    track('signed_up', { method: 'email' })
    // The token is already stored (auth-client onSuccess); the session query picks it up and the
    // route guards move on, exactly as after any other sign-in.
    queryClient.invalidateQueries({ queryKey: ['session'] })
  }

  async function resend() {
    if (wait > 0 || busy) return
    setError(null)
    setNotice(null)
    setBusy(true)
    const res = await authClient.emailOtp
      .sendVerificationOtp({ email, type: 'email-verification' })
      .catch(() => ({ error: NETWORK_ERROR }))
    setBusy(false)
    if ('error' in res && res.error) {
      setError(authErrorMessage(res.error as Failure, t('auth.fallback')))
      return
    }
    setCode('')
    setWait(RESEND_SECONDS)
    setNotice(t('auth.confirm_resent'))
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
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
            <View className="items-center gap-3">
              <Wordmark size={72} />
              <Serif className="text-center text-serif-md text-text">
                {t('auth.confirm_title')}
              </Serif>
              <Body className="text-center text-subhead text-text-muted">
                {t('auth.confirm_body', { email })}
              </Body>
            </View>

            <View className="gap-3">
              <Field
                value={code}
                onChangeText={(text) => {
                  const digits = codeDigits(text)
                  setCode(digits)
                  if (digits.length === EMAIL_CODE_LENGTH) confirm(digits)
                }}
                accessibilityLabel={t('auth.confirm_code_label')}
                placeholder="000000"
                keyboardType="number-pad"
                inputMode="numeric"
                // iOS offers the code from the mail above the keyboard when it sees this hint.
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={EMAIL_CODE_LENGTH}
                // No letter-spacing: a spaced TextInput leaked its placeholder spacing into the next
                // screen's first field when React Native recycled the native view.
                style={{ textAlign: 'center' }}
              />
              <Button
                disabled={busy || code.length !== EMAIL_CODE_LENGTH}
                onPress={() => confirm(code)}
              >
                {busy ? '…' : t('auth.confirm_button')}
              </Button>
              {error && (
                <Caption className="text-center text-danger" accessibilityLiveRegion="polite">
                  {error}
                </Caption>
              )}
              {notice && (
                <Caption className="text-center text-text-2" accessibilityLiveRegion="polite">
                  {notice}
                </Caption>
              )}

              <Pressable
                accessibilityRole="button"
                disabled={wait > 0 || busy}
                onPress={resend}
                className="min-h-[44px] items-center justify-center active:opacity-70 disabled:opacity-45"
              >
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-semibold text-pill text-text"
                >
                  {wait > 0 ? t('auth.confirm_resend_in', { n: wait }) : t('auth.confirm_resend')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onBack}
                className="min-h-[44px] items-center justify-center active:opacity-70"
              >
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="text-center font-ui text-pill text-text-muted"
                >
                  {t('auth.confirm_wrong_email')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
