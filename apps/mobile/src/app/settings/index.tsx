import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native'

import { RowButton } from '@/components/SettingsRow'
import { Caption, Eyebrow } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { ChevronIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { api } from '@/lib/api'
import { signOut } from '@/lib/auth-client'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { shareInviteLink } from '@/lib/shareProfile'
import type { MeStats } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// Settings hub (M15) — a shallow index of a few grouped destinations instead
// of the one long flat scroll app/settings.tsx used to be (521 lines, every
// control at once). Tu cuenta / Privacidad / Preferencias / Acerca de each
// got deep enough (3-4 rows apiece) to earn their own screen; Amigos and
// Ayuda stay right here since they're one or two rows each. Row/RowButton
// move to components/SettingsRow.tsx so every screen in this directory
// shares them instead of each redefining its own copy.
export default function SettingsHub() {
  const router = useRouter()
  const t = useT()
  const { data } = useProfile(true)
  const p = data?.profile

  const stats = useQuery({ queryKey: ['me-stats'], queryFn: () => api.get<MeStats>('/me/stats') })

  const [inviting, setInviting] = useState(false)
  // How many people actually joined through your link. Only shown once it's
  // non-zero — "0 se unieron" is a scoreboard nobody asked for.
  const inviteStats = useQuery({
    queryKey: ['invite-stats'],
    queryFn: () => api.get<{ joined: number }>('/invites/me/stats'),
  })
  async function shareInvite() {
    if (inviting) return
    setInviting(true)
    try {
      const { code } = await api.get<{ code: string }>('/invites/me')
      await shareInviteLink(code)
      inviteStats.refetch()
    } catch (err) {
      captureError(err, 'invite.share')
      toast({ variant: 'error', message: t('settings.invite_error') })
    } finally {
      setInviting(false)
    }
  }

  const [signingOut, setSigningOut] = useState(false)
  const accent = useColor('accent')
  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    await signOut()
    router.replace('/sign-in')
  }

  // The support inbox waits on Mesa's own domain, so the row is env-gated
  // rather than shipping a mailto nobody reads: set EXPO_PUBLIC_SUPPORT_EMAIL
  // (EAS env) and the Ayuda section appears, with no code change. A fake or
  // personal address in a store build is worse than no row — during the beta
  // support runs through the invite email and TestFlight's own feedback, which
  // is what the legal pages tell members (lib/legalCopy.ts).
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL
  function reportProblem() {
    if (!supportEmail) return
    Linking.openURL(
      `mailto:${supportEmail}?subject=${encodeURIComponent(t('settings.report_subject'))}`,
    ).catch(() => {})
  }

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Tappable profile card → straight into edit mode, not the profile
            tab's view mode — that's one tap saved for the single most common
            reason anyone opens Settings' own header row. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/profile?edit=1')}
          className="flex-row items-center gap-3 rounded border border-line bg-surface p-3 active:opacity-80"
        >
          <Avatar name={p?.name || p?.handle || 'm'} src={p?.image} size={44} />
          <View className="min-w-0 flex-1">
            <Text className="font-serif text-serif-md text-text" numberOfLines={1}>
              {p?.name || t('common.you')}
            </Text>
            <Caption numberOfLines={1}>
              {[
                p?.handle ? `@${p.handle}` : null,
                stats.isError ? null : t('settings.ranked_count', { n: stats.data?.places ?? 0 }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Caption>
          </View>
          <Text className="font-ui-medium text-label text-accent-strong">
            {t('settings.edit_profile')}
          </Text>
        </Pressable>

        <View className="mt-6 rounded border border-line bg-surface px-4">
          <RowButton onPress={() => router.push('/settings/account')}>
            <Text className="flex-1 font-ui text-body text-text">{t('settings.account')}</Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
          <RowButton onPress={() => router.push('/settings/privacy')}>
            <Text className="flex-1 font-ui text-body text-text">{t('settings.privacy')}</Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
          <RowButton onPress={() => router.push('/settings/preferences')}>
            <Text className="flex-1 font-ui text-body text-text">{t('settings.preferences')}</Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
          <RowButton onPress={() => router.push('/notificaciones')}>
            <Text className="flex-1 font-ui text-body text-text">
              {t('settings.notifications')}
            </Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
          <RowButton onPress={() => router.push('/settings/about')} last>
            <Text className="flex-1 font-ui text-body text-text">{t('settings.about')}</Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
        </View>

        <Eyebrow className="mt-6 mb-2">{t('settings.friends_section')}</Eyebrow>
        <View className="rounded border border-line bg-surface px-4">
          <RowButton onPress={() => router.push('/amigos')}>
            <Text className="flex-1 font-ui text-body text-text">{t('settings.find_friends')}</Text>
            <ChevronIcon size={16} color="text-faint" />
          </RowButton>
          <RowButton onPress={shareInvite} disabled={inviting} last>
            <Text className="flex-1 font-ui text-body text-text">
              {t('settings.invite_friends')}
            </Text>
            {inviteStats.data && inviteStats.data.joined > 0 ? (
              <Caption className="text-micro">
                {t('settings.joined_count', { n: inviteStats.data.joined })}
              </Caption>
            ) : (
              <ChevronIcon size={16} color="text-faint" />
            )}
          </RowButton>
        </View>

        {supportEmail ? (
          <>
            <Eyebrow className="mt-6 mb-2">{t('settings.help')}</Eyebrow>
            <View className="rounded border border-line bg-surface px-4">
              <RowButton onPress={reportProblem} last>
                <Text className="flex-1 font-ui text-body text-text">
                  {t('settings.report_problem')}
                </Text>
                <ChevronIcon size={16} color="text-faint" />
              </RowButton>
            </View>
          </>
        ) : null}

        {p?.isModerator ? (
          <View className="mt-6 rounded border border-line bg-surface px-4">
            <RowButton onPress={() => router.push('/moderation')} last>
              <Text className="flex-1 font-ui text-body text-text">{t('settings.moderation')}</Text>
              <ChevronIcon size={16} color="text-faint" />
            </RowButton>
          </View>
        ) : null}

        <View className="mt-6 rounded border border-line bg-surface px-4">
          <RowButton onPress={handleSignOut} disabled={signingOut} last>
            <Text className="flex-1 font-ui-medium text-body text-accent-strong">
              {t('settings.sign_out')}
            </Text>
            {signingOut ? <ActivityIndicator size="small" color={accent} /> : null}
          </RowButton>
        </View>
      </ScrollView>
    </View>
  )
}
