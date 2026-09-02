import { Body, Button, Caption, Eyebrow, SerifItalic, Wordmark } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { authClient, signOut } from '@/lib/auth-client'
import { authErrorEs } from '@/lib/authErrors'
import { clearAuthLost } from '@/lib/authLost'
import { queryClient } from '@/lib/query'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, type TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Sign-in — email + password (the launch method) plus Sign in with Apple (App
// Store 4.8, since Mesa also offers Instagram). Instagram-handle linking lives in
// onboarding, and the full verify-email page is a follow-up. Ported from
// apps/app/src/screens/AuthFlow.tsx.
type AuthClientError = { code?: string; message?: string; status?: number }
const NETWORK_ERROR: AuthClientError = { message: 'network' }

export function AuthFlow({ suspended = false }: { suspended?: boolean }) {
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
        setError('No se pudo iniciar con Apple.')
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
        setError(authErrorEs(res.error, 'No se pudo iniciar con Apple.'))
        return
      }
      queryClient.invalidateQueries({ queryKey: ['session'] })
    } catch (e) {
      // The user dismissing the Apple sheet is a cancel, not an error.
      setBusy(false)
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        setError('No se pudo iniciar con Apple.')
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
        authErrorEs(
          res.error,
          mode === 'signup'
            ? 'No se pudo crear la cuenta.'
            : 'El correo o la contraseña no coinciden.',
        ),
      )
      return
    }
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
      setError(authErrorEs(res.error))
      return
    }
    setResetSent(true)
  }

  if (suspended) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <View className="flex-1 items-center justify-center gap-4 px-5">
          <Wordmark size={64} />
          <Eyebrow className="font-mono text-accent-strong">Cuenta suspendida</Eyebrow>
          <SerifItalic className="text-title text-center">Tu cuenta ya no está activa.</SerifItalic>
          <Body className="max-w-[19rem] text-center">
            Suspendimos esta cuenta por incumplir las normas de la comunidad. Si crees que fue un
            error, responde al correo con el que te registraste.
          </Body>
          <View className="mt-4 w-full">
            <Button
              variant="secondary"
              mono
              onPress={async () => {
                await signOut().catch(() => {})
                clearAuthLost()
              }}
            >
              Volver al inicio
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
          <Wordmark size={64} />
          <Eyebrow className="font-mono text-accent-strong">
            Una revolución gastronómica social · Santo Domingo
          </Eyebrow>
          <SerifItalic className="text-title text-center">
            Rankea donde comes. Confía en quien conoces.
          </SerifItalic>
          <Body className="max-w-[19rem] text-center">
            Sin estrellas, sin desconocidos. Solo los números de tus amigos, en orden.
          </Body>
        </View>

        <View className="gap-3">
          <Eyebrow>{mode === 'signup' ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</Eyebrow>
          {/* textContentType is what actually turns on iCloud Keychain: username
              + newPassword is the pair iOS looks for to offer a strong password
              on sign-up and to save the credential afterwards. */}
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.com"
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
            placeholder="Contraseña (8+ caracteres)"
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            returnKeyType="go"
            enablesReturnKeyAutomatically
            onSubmitEditing={() => {
              if (canSubmit && !busy) emailAuth()
            }}
          />
          {mode === 'signup' && password.length > 0 && password.length < 8 && (
            <Caption className="text-status-packed">
              Le faltan {8 - password.length} caracteres.
            </Caption>
          )}
          <Button disabled={busy || !canSubmit} onPress={emailAuth}>
            {busy ? '…' : mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
          </Button>
          {error && (
            <Caption className="text-center text-status-packed" accessibilityLiveRegion="polite">
              {error}
            </Caption>
          )}

          {resetSent ? (
            <Caption className="text-center text-text-2">
              Si ese correo está registrado, te llegará un enlace para restablecerla.
            </Caption>
          ) : (
            mode === 'signin' && (
              <Button variant="ghost" disabled={busy || !email.includes('@')} onPress={sendReset}>
                ¿Olvidaste tu contraseña?
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
            {mode === 'signup'
              ? '¿Ya tienes una cuenta? Inicia sesión'
              : '¿Nuevo aquí? Crea una cuenta'}
          </Button>

          {Platform.OS === 'ios' && appleAvailable && (
            <>
              <View className="my-1 flex-row items-center gap-3">
                <View className="h-px flex-1 bg-line" />
                <Caption className="font-mono text-[10px]">o</Caption>
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
