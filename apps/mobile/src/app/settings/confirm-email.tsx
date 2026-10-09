import { useLocalSearchParams, useRouter } from 'expo-router'

import { ConfirmEmailCode } from '@/components/ConfirmEmailCode'
import { toast } from '@/components/ui/toast-store'
import { useT } from '@/lib/i18n'

// Settings → Verify email: the code was just mailed from the account screen; this is where it is typed.
export default function ConfirmEmail() {
  const t = useT()
  const router = useRouter()
  const { email } = useLocalSearchParams<{ email?: string }>()
  return (
    <ConfirmEmailCode
      email={email ?? ''}
      onBack={() => router.back()}
      onConfirmed={() => {
        toast({ message: t('settings.email_confirmed') })
        router.back()
      }}
    />
  )
}
