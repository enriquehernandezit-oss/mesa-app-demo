import { useEffect } from 'react'

import { api } from '@/lib/api'
import { useSession } from '@/lib/auth-client'
import { useLanguage } from '@/lib/i18n'

// Tells the server which language this member reads, so their pushes arrive in it (the
// server writes each push itself — users.locale). Sent once per app start and again whenever
// the language changes or a different member signs in; a failed call is retried on the next
// start. Mounted from the root layout, not the tabs: a start that lands straight on a deep
// link (a tapped push) has no tabs mounted, and the language must still reach the server.
let lastSent: string | null = null

export function useLocaleSync(): void {
  const lang = useLanguage()
  const userId = useSession().data?.user?.id
  useEffect(() => {
    if (!userId) return
    const key = `${userId}:${lang}`
    if (lastSent === key) return
    lastSent = key
    api.patch('/me/locale', { locale: lang }).catch(() => {
      if (lastSent === key) lastSent = null
    })
  }, [userId, lang])
}
