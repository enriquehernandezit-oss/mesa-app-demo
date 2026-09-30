import { useMutation, useQueryClient } from '@tanstack/react-query'
import { File, Paths } from 'expo-file-system'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Share, Text, View } from 'react-native'

import { Group, NavRow, Row } from '@/components/SettingsRow'
import { Caption, MAX_SCALE, Toggle } from '@/components/ui'
import { DownloadIcon, LockIcon, PeopleIcon, PersonIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { useFollowRequests } from '@/hooks/useBell'
import { useProfile } from '@/hooks/useProfile'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { setFriendsOnlyScores, useFriendsOnlyScores } from '@/lib/prefs'
import type { MeResponse, Ranking } from '@/lib/types'

// Privacy (M15) — a private account (F1), friends-only scores, blocked accounts (its own screen,
// settings/blocked.tsx), export my rankings. Moved out of the old flat app/settings.tsx's "Tu
// lista" section.
export default function PrivacySettings() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const t = useT()
  const friendsOnly = useFriendsOnlyScores()
  const [exporting, setExporting] = useState(false)
  const isPrivate = useProfile(true).data?.profile.isPrivate ?? false
  const requests = useFollowRequests()

  // The private-account switch: flips at once, rolls back if the server says no. Turning it OFF
  // approves everyone still waiting (there is nothing left to guard), so with requests pending it
  // asks first.
  const setPrivate = useMutation({
    mutationFn: (value: boolean) =>
      api.patch<{ isPrivate: boolean }>('/me/privacy', { isPrivate: value }),
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey: ['me'] })
      const previous = queryClient.getQueryData<MeResponse>(['me'])
      if (previous) {
        queryClient.setQueryData<MeResponse>(['me'], {
          ...previous,
          profile: { ...previous.profile, isPrivate: value },
        })
      }
      return { previous }
    },
    onError: (_err, _value, context) => {
      if (context?.previous) queryClient.setQueryData(['me'], context.previous)
      toast({ variant: 'error', message: t('settings.private_error') })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
  const onTogglePrivate = (value: boolean) => {
    const waiting = requests.data?.count ?? 0
    if (value || waiting === 0) {
      setPrivate.mutate(value)
      return
    }
    Alert.alert(t('settings.private_off_title'), t('settings.private_off_body', { n: waiting }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.private_off_confirm'), onPress: () => setPrivate.mutate(false) },
    ])
  }

  // Export — your ranked list as JSON. Native writes the file to the cache
  // and hands it to the share sheet, so it can go to Files, Mail, anywhere.
  async function exportRankings() {
    if (exporting) return
    setExporting(true)
    try {
      const res = await api.get<{ rankings: Ranking[] }>('/rankings')
      const file = new File(Paths.cache, 'mesa-rankings.json')
      // create({ overwrite }) so a second export doesn't fail on the leftover.
      file.create({ overwrite: true })
      file.write(JSON.stringify(res.rankings, null, 2))
      await Share.share({ url: file.uri, message: t('settings.export_share_message') })
    } catch {
      toast({ variant: 'error', message: t('settings.export_error') })
    } finally {
      setExporting(false)
    }
  }

  return (
    <View className="flex-1 bg-bg px-4 pt-3">
      <Group>
        <Row>
          <LockIcon size={18} />
          <View className="min-w-0 flex-1">
            <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-body text-text">
              {t('settings.private_account')}
            </Text>
            <Caption className="text-meta">{t('settings.private_account_hint')}</Caption>
          </View>
          <Toggle
            checked={isPrivate}
            onChange={onTogglePrivate}
            label={t('settings.private_account')}
          />
        </Row>
        <Row>
          <PeopleIcon size={18} />
          <View className="min-w-0 flex-1">
            <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-body text-text">
              {t('settings.friends_only_scores')}
            </Text>
            <Caption className="text-meta">{t('settings.friends_only_scores_hint')}</Caption>
          </View>
          <Toggle
            checked={friendsOnly}
            onChange={(v) => {
              setFriendsOnlyScores(v)
              queryClient.invalidateQueries({ queryKey: ['restaurant'] })
            }}
            label={t('settings.friends_only_scores')}
          />
        </Row>
        <NavRow
          icon={<PersonIcon size={18} />}
          label={t('settings.blocked_accounts')}
          onPress={() => router.push('/settings/blocked')}
        />
        <NavRow
          icon={<DownloadIcon size={18} />}
          label={t('settings.export_rankings')}
          onPress={exportRankings}
          disabled={exporting}
          trailing={exporting ? <Caption className="text-micro">…</Caption> : undefined}
          last
        />
      </Group>
    </View>
  )
}
