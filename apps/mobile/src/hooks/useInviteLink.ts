import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { shareInviteLink } from '@/lib/shareProfile'

// The invite link, shared by Settings' "Invita a tus amigos" row and the
// find-friends screen — the code is created server-side on first ask, so an
// account that never shares never gets a row.
export function useInviteLink() {
  const t = useT()
  const [sharing, setSharing] = useState(false)
  const stats = useQuery({
    queryKey: ['invite-stats'],
    queryFn: () => api.get<{ joined: number }>('/invites/me/stats'),
  })

  async function share() {
    if (sharing) return
    setSharing(true)
    try {
      const { code } = await api.get<{ code: string }>('/invites/me')
      await shareInviteLink(code)
      stats.refetch()
    } catch (err) {
      captureError(err, 'invite.share')
      toast({ variant: 'error', message: t('settings.invite_error') })
    } finally {
      setSharing(false)
    }
  }

  return { share, sharing, joined: stats.data?.joined ?? 0 }
}
