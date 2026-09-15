import { Body, Button, Caption, Eyebrow, SerifItalic, Wordmark } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { track } from '@/lib/analytics'
import { authClient, signOut } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/authErrors'
import { clearAuthLost } from '@/lib/authLost'
import { useT } from '@/lib/i18n'
import { queryClient } from '@/lib/query'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, type TextInput, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

// A terminal-style blinking cursor after "objetivo: SDQ" — same opacity-loop
// shape as components/ui's Skeleton shimmer.
function BlinkingCursor() {
  const o = useSharedValue(1)
  useEffect(() => {
    o.value = withRepeat(withTiming(0, { duration: 500 }), -1, true)
  }, [o])
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  return (
    <Animated.Text style={style} className="font-serif-italic text-serif-sm text-text">
      _
    </Animated.Text>
  )
}

// Sign-in — email + password (the launch method) plus Sign in with Apple, shown
// with equal prominence per App Store 4.8. There is no Instagram sign-in button
// here: Instagram is wired server-side (Better Auth) but never surfaced as a
// login method in this app — the @usuario field in onboarding is a display
// handle only, which can be, but doesn't have to be, someone's Instagram
// username. The full verify-email page is a follow-up. Ported from
// apps/app/src/screens/AuthFlow.tsx.
type AuthClientError = { code?: string; message?: string; status?: number }
const NETWORK_ERROR: AuthClientError = { message: 'network' }

export function AuthFlow({ suspended = false }: { suspended?: boolean }) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [resetSent, setResetSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appleAvailable, setAppleAvailable] = useState(false)
  const passwordRef = useRef<TextInput>(null)
  const theme = useResolvedTheme()

  // Sign in with Apple is iOS-only (and simulator-dependent). Probe once; the
  // button only renders when the device actually supports it.
  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false))
  }, [])

  async function appleAuth() {
    setError(null)
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })
      if (!cred.identityToken) {
        setError(t('auth.apple_error'))
        return
      }
      // Native id-token sign-in: the server verifies the token against the app's
      // bundle id (auth.ts `appBundleIdentifier`) — no web redirect, no deep link.
      setBusy(true)
      const res = await authClient.signIn
        .social({ provider: 'apple', idToken: { token: cred.identityToken } })
        .catch(() => ({ error: NETWORK_ERROR }))
      setBusy(false)
      if ('error' in res && res.error) {
        setError(authErrorMessage(res.error, t('auth.apple_error')))
        return
      }
      track('signed_in', { method: 'apple' })
      queryClient.invalidateQueries({ queryKey: ['session'] })
    } catch (e) {
      // The user dismissing the Apple sheet is a cancel, not an error.
      setBusy(false)
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        setError(t('auth.apple_error'))
      }
    }
  }

  async function emailAuth() {
    setError(null)
    setBusy(true)
    const addr = email.trim()
    const res = await (mode === 'signup'
      ? authClient.signUp.email({ email: addr, password, name: addr.split('@')[0] ?? addr })
      : authClient.signIn.email({ email: addr, password })
    ).catch(() => ({ error: NETWORK_ERROR }))
    setBusy(false)
    if ('error' in res && res.error) {
      setError(
        authErrorMessage(
          res.error,
          mode === 'signup' ? t('auth.signup_generic_error') : t('auth.INVALID_EMAIL_OR_PASSWORD'),
        ),
      )
      return
    }
    track(mode === 'signup' ? 'signed_up' : 'signed_in', { method: 'email' })
    queryClient.invalidateQueries({ queryKey: ['session'] })
  }

  async function sendReset() {
    setError(null)
    setBusy(true)
    const res = await authClient
      .requestPasswordReset({ email: email.trim(), redirectTo: '/reset-password' })
      .catch(() => ({ error: NETWORK_ERROR }))
    setBusy(false)
    if ('error' in res && res.error && (res.error as AuthClientError).status === 429) {
      setError(authErrorMessage(res.error))
      return
    }
    setResetSent(true)
  }

  if (suspended) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <View className="flex-1 items-center justify-center gap-4 px-5">
          <Wordmark size={64} />
          <Eyebrow className="font-mono text-accent-strong">{t('auth.suspended_title')}</Eyebrow>
          <SerifItalic className="text-title text-center">
            {t('auth.suspended_headline')}
          </SerifItalic>
          <Body className="max-w-[19rem] text-center">{t('auth.suspended_body')}</Body>
          <View className="mt-4 w-full">
            <Button
              variant="secondary"
              mono
              onPress={async () => {
                await signOut().catch(() => {})
                clearAuthLost()
              }}
            >
              {t('auth.back_to_start')}
            </Button>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  const canSubmit = email.includes('@') && password.length >= 8

  return (
    <SafeAreaView className="flex-1 bg-bg">
      {/* This form is centered and doesn't scroll, so the keyboard would sit on
          top of the password field on a smaller phone. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center gap-5 px-5"
      >
        <View className="items-center gap-2">
          <Wordmark size={84} />
          <View className="items-center">
            <Eyebrow className="font-mono text-accent-strong">Revolución gastronómica</Eyebrow>
            <View className="flex-row items-baseline">
              <Eyebrow className="font-mono text-accent-strong">Primer </Eyebrow>
              <SerifItalic className="text-serif-sm text-text">objetivo: SDQ</SerifItalic>
              <BlinkingCursor />
            </View>
          </View>
        </View>

        <View className="gap-3">
          <Eyebrow>
            {mode === 'signup' ? t('auth.create_account_eyebrow') : t('auth.welcome_back')}
          </Eyebrow>
          {/* textContentType is what actually turns on iCloud Keychain: username
              + newPassword is the pair iOS looks for to offer a strong password
              on sign-up and to save the credential afterwards. */}
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.email_placeholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            inputMode="email"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Field
            ref={passwordRef}
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.password_placeholder')}
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            // Without this, iOS's suggested-strong-password generator follows
            // its own default rule and can hand back something shorter than
            // the server's 8-char minimum — a password iOS itself just
            // generated then gets rejected by the account it was for.
            passwordRules={mode === 'signup' ? 'minlength: 8;' : undefined}
            returnKeyType="go"
            enablesReturnKeyAutomatically
            onSubmitEditing={() => {
              if (canSubmit && !busy) emailAuth()
            }}
          />
          {mode === 'signup' && password.length > 0 && password.length < 8 && (
            <Caption className="text-status-packed">
              {t('auth.password_chars_left', { n: 8 - password.length })}
            </Caption>
          )}
          <Button disabled={busy || !canSubmit} onPress={emailAuth}>
            {busy
              ? '…'
              : mode === 'signup'
                ? t('auth.create_account_button')
                : t('auth.sign_in_button')}
          </Button>
          {error && (
            <Caption className="text-center text-status-packed" accessibilityLiveRegion="polite">
              {error}
            </Caption>
          )}

          {resetSent ? (
            <Caption className="text-center text-text-2">{t('auth.reset_sent')}</Caption>
          ) : (
            mode === 'signin' && (
              <Button variant="ghost" disabled={busy || !email.includes('@')} onPress={sendReset}>
                {t('auth.forgot_password')}
              </Button>
            )
          )}

          <Button
            variant="ghost"
            onPress={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup')
              setError(null)
              setResetSent(false)
            }}
          >
            {mode === 'signup' ? t('auth.switch_to_signin') : t('auth.switch_to_signup')}
          </Button>

          {Platform.OS === 'ios' && appleAvailable && (
            <>
              <View className="my-1 flex-row items-center gap-3">
                <View className="h-px flex-1 bg-line" />
                <Caption className="font-mono text-micro">{t('auth.or_divider')}</Caption>
                <View className="h-px flex-1 bg-line" />
              </View>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  theme === 'candlelit'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={14}
                style={{ height: 52, width: '100%' }}
                onPress={appleAuth}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
