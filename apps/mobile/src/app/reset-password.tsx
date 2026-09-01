import { Body, Button, Caption, Eyebrow, SerifItalic, Wordmark } from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { useColor } from '@/theme/useColor'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Reached from the password-reset email (a universal link →
// /reset-password?token=…, or the mesa:// scheme). Renders outside the auth gate
// so a signed-out member can complete it. Collects a new password and calls
// resetPassword. Ported from apps/app/src/screens/auth/ResetPassword.tsx.
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>()
  const router = useRouter()
  const placeholder = useColor('text-muted')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const goSignIn = () => router.replace('/sign-in')

  async function submit() {
    if (!token) return
    setError(null)
    setBusy(true)
    const { error: err } = await authClient.resetPassword({ newPassword: password, token })
    setBusy(false)
    if (err) return setError(err.message ?? 'Este enlace no es válido o ya venció.')
    setDone(true)
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center gap-5 px-5">
        <View className="items-center gap-2">
          <Wordmark size={56} />
          <Eyebrow>Restablecer contraseña</Eyebrow>
        </View>

        {!token ? (
          <View className="gap-3">
            <SerifItalic className="text-serif-sm text-center">
              A este enlace le falta el token.
            </SerifItalic>
            <Body className="text-center text-text-2">
              Pide un nuevo enlace desde la pantalla de inicio de sesión.
            </Body>
            <Button variant="primary" onPress={goSignIn}>
              Volver a iniciar sesión
            </Button>
          </View>
        ) : done ? (
          <View className="gap-3">
            <SerifItalic className="text-serif-md text-center">Contraseña actualizada.</SerifItalic>
            <Button variant="primary" onPress={goSignIn}>
              Iniciar sesión
            </Button>
          </View>
        ) : (
          <View className="gap-3">
            <TextInput
              className="min-h-[52px] rounded border border-line bg-surface px-4 font-ui text-body text-text"
              placeholderTextColor={placeholder}
              placeholder="Nueva contraseña (8+ caracteres)"
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              className="min-h-[52px] rounded border border-line bg-surface px-4 font-ui text-body text-text"
              placeholderTextColor={placeholder}
              placeholder="Confirma la nueva contraseña"
              secureTextEntry
              autoComplete="new-password"
              value={confirm}
              onChangeText={setConfirm}
            />
            <Button
              variant="primary"
              disabled={busy || password.length < 8 || password !== confirm}
              onPress={submit}
            >
              {busy ? '…' : 'Guardar nueva contraseña'}
            </Button>
            {password.length > 0 && confirm.length > 0 && password !== confirm && (
              <Caption className="text-status-packed">Las contraseñas no coinciden.</Caption>
            )}
            {error && <Caption className="text-status-packed">{error}</Caption>}
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
