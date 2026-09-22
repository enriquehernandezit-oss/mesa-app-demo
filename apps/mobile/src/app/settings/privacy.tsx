import { useQueryClient } from '@tanstack/react-query'
import { File, Paths } from 'expo-file-system'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Share, Text, View } from 'react-native'

import { Row, RowButton } from '@/components/SettingsRow'
import { Caption, Toggle } from '@/components/ui'
import { ChevronIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { setFriendsOnlyScores, useFriendsOnlyScores } from '@/lib/prefs'
import type { Ranking } from '@/lib/types'

// Privacy (M15) — friends-only scores, blocked accounts (its own screen,
// settings/blocked.tsx), export my rankings. Moved out of the old flat
// app/settings.tsx's "Tu lista" section.
export default function PrivacySettings() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const t = useT()
  const friendsOnly = useFriendsOnlyScores()
  const [exporting, setExporting] = useState(false)

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
    <View className="flex-1 bg-bg px-5 pt-4">
      <View className="rounded border border-line bg-surface px-4">
        <Row>
          <Text className="flex-1 font-ui text-body text-text">
            {t('settings.friends_only_scores')}
          </Text>
          <Toggle
            checked={friendsOnly}
            onChange={(v) => {
              setFriendsOnlyScores(v)
              queryClient.invalidateQueries({ queryKey: ['restaurant'] })
            }}
            label={t('settings.friends_only_scores')}
          />
        </Row>
        <RowButton onPress={() => router.push('/settings/blocked')}>
          <Text className="flex-1 font-ui text-body text-text">
            {t('settings.blocked_accounts')}
          </Text>
          <ChevronIcon size={16} color="text-faint" />
        </RowButton>
        <RowButton onPress={exportRankings} disabled={exporting} last>
          <Text className="flex-1 font-ui text-body text-text">
            {t('settings.export_rankings')}
          </Text>
          {exporting ? (
            <Caption className="text-micro">…</Caption>
          ) : (
            <ChevronIcon size={16} color="text-faint" />
          )}
        </RowButton>
      </View>
    </View>
  )
}
