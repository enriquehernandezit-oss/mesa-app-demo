import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native'

import { Group, GroupLabel, NavRow } from '@/components/SettingsRow'
import { Caption, MAX_SCALE } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import {
  BellIcon,
  FlagIcon,
  InfoIcon,
  LockIcon,
  MailIcon,
  PeopleIcon,
  PersonIcon,
  SendIcon,
  SunIcon,
} from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { api } from '@/lib/api'
import { signOut } from '@/lib/auth-client'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { shareInviteLink } from '@/lib/shareProfile'
import type { MeStats } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'

// Settings hub (M15) — a shallow index of a few grouped destinations instead
// of the one long flat scroll app/settings.tsx used to be (521 lines, every
// control at once). Account / Privacy / Preferences / About each got deep
// enough (3-4 rows apiece) to earn their own screen; Friends and Help stay
// right here since they're one or two rows each. Row/RowButton move to
// components/SettingsRow.tsx so every screen in this directory shares them
// instead of each redefining its own copy. Redesign 2: a raised me card (tap it to edit), then icon
// groups — the account pages, Friends, help, the moderator queue — and Sign out on its own.
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
  const lift = useLift()
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
        contentContainerClassName="px-4 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Tappable profile card → straight into edit mode, not the profile
            tab's view mode — that's one tap saved for the single most common
            reason anyone opens Settings' own header row. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/profile?edit=1')}
          className="mt-3 flex-row items-center gap-3 rounded-card bg-surface px-4 py-3.5 active:opacity-80"
          style={lift}
        >
          <Avatar name={p?.name || p?.handle || 'm'} src={p?.image} size={48} />
          <View className="min-w-0 flex-1">
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-serif text-serif-md text-text"
              numberOfLines={1}
            >
              {p?.name || t('common.you')}
            </Text>
            <Caption numberOfLines={1} className="text-meta">
              {[
                p?.handle ? `@${p.handle}` : null,
                stats.isError ? null : t('settings.ranked_count', { n: stats.data?.places ?? 0 }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Caption>
          </View>
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui-semibold text-label text-accent"
          >
            {t('settings.edit_profile')}
          </Text>
        </Pressable>

        <Group className="mt-4">
          <NavRow
            icon={<PersonIcon size={18} />}
            label={t('settings.account')}
            onPress={() => router.push('/settings/account')}
          />
          <NavRow
            icon={<LockIcon size={18} />}
            label={t('settings.privacy')}
            onPress={() => router.push('/settings/privacy')}
          />
          <NavRow
            icon={<SunIcon size={18} />}
            label={t('settings.preferences')}
            onPress={() => router.push('/settings/preferences')}
          />
          <NavRow
            icon={<BellIcon size={18} />}
            label={t('settings.notifications')}
            onPress={() => router.push('/notifications')}
          />
          <NavRow
            icon={<InfoIcon size={18} />}
            label={t('settings.about')}
            onPress={() => router.push('/settings/about')}
            last
          />
        </Group>

        <GroupLabel>{t('settings.friends_section')}</GroupLabel>
        <Group>
          <NavRow
            icon={<PeopleIcon size={18} />}
            label={t('settings.find_friends')}
            onPress={() => router.push('/friends')}
          />
          <NavRow
            icon={<SendIcon size={18} />}
            label={t('settings.invite_friends')}
            onPress={shareInvite}
            disabled={inviting}
            meta={
              inviteStats.data && inviteStats.data.joined > 0
                ? t('settings.joined_count', { n: inviteStats.data.joined })
                : undefined
            }
            last
          />
        </Group>

        {supportEmail ? (
          <>
            <GroupLabel>{t('settings.help')}</GroupLabel>
            <Group>
              <NavRow
                icon={<MailIcon size={18} />}
                label={t('settings.report_problem')}
                onPress={reportProblem}
                last
              />
            </Group>
          </>
        ) : null}

        {p?.isModerator ? (
          <Group className="mt-5">
            <NavRow
              icon={<FlagIcon size={18} />}
              label={t('settings.moderation')}
              onPress={() => router.push('/moderation')}
              last
            />
          </Group>
        ) : null}

        <Group className="mt-5">
          <NavRow
            label={t('settings.sign_out')}
            onPress={handleSignOut}
            disabled={signingOut}
            trailing={signingOut ? <ActivityIndicator size="small" color={accent} /> : null}
            last
          />
        </Group>
      </ScrollView>
    </View>
  )
}
