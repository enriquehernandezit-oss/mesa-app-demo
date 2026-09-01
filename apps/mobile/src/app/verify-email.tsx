import { Body, Button, Caption, Eyebrow, SerifItalic, Wordmark } from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { authErrorEs } from '@/lib/authErrors'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Reached from the verification email. Two ways it arrives on native: the API's
// verify endpoint verifies the token and 302s to this page's universal link with
// no token (verification already done → land on "confirmed"); or a direct token
// link opens here and we verify client-side. An ?error= means the link failed.
// Renders outside the auth gate — the link is often opened on a different device
// from the one that signed up. Ported from apps/app/src/screens/auth/VerifyEmail.tsx.
type State = 'verifying' | 'done' | 'expired' | 'missing'

export default function VerifyEmail() {
  const { token, error: errorParam } = useLocalSearchParams<{ token?: string; error?: string }>()
  const router = useRouter()
  const [state, setState] = useState<State>(errorParam ? 'expired' : token ? 'verifying' : 'done')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    authClient
      .verifyEmail({ query: { token } })
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          setError(authErrorEs(res.error, 'Ese enlace ya no sirve.'))
          setState('expired')
          return
        }
        setState('done')
      })
      .catch(() => {
        if (cancelled) return
        setError('No pudimos conectar. Intenta de nuevo.')
        setState('expired')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  // A hard reset to '/': verification signs the member in
  // (autoSignInAfterVerification), and this page renders outside the app's gate.
  const enter = () => router.replace('/')

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center gap-4 px-5">
        <View className="items-center gap-2">
          <Wordmark size={64} />
          <Eyebrow className="font-mono text-accent-strong">
            {state === 'done' ? 'Correo confirmado' : 'Confirma tu correo'}
          </Eyebrow>

          {state === 'verifying' && <Caption>Confirmando…</Caption>}

          {state === 'done' && (
            <>
              <SerifItalic className="text-title text-center">
                Listo. Tu correo quedó confirmado.
              </SerifItalic>
              <Body className="max-w-[19rem] text-center text-text-2">
                Ya puedes rankear, escribir notas y agregar platos.
              </Body>
            </>
          )}

          {(state === 'expired' || state === 'missing') && (
            <>
              <SerifItalic className="text-title text-center">
                {state === 'missing'
                  ? 'A este enlace le falta el token.'
                  : 'Ese enlace ya no sirve.'}
              </SerifItalic>
              <Body className="max-w-[19rem] text-center text-text-2">
                Entra a Mesa y pide uno nuevo desde Ajustes — los enlaces vencen por seguridad.
              </Body>
              {error && (
                <Caption className="text-center text-status-packed" accessibilityRole="alert">
                  {error}
                </Caption>
              )}
            </>
          )}
        </View>

        <View className="mt-4">
          <Button variant="primary" onPress={enter}>
            {state === 'done' ? 'Entrar a Mesa' : 'Ir a Mesa'}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  )
}
