import { File } from 'expo-file-system'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'

import { FollowPill, PersonRow } from '@/components/PersonRow'
import { Body, Button, Caption, Card, Eyebrow, Title } from '@/components/ui'
import { useInviteLink } from '@/hooks/useInviteLink'
import { api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { parseInstagramExport } from '@/lib/instagramImport'
import type { ContactMatchUser } from '@/lib/types'

// Instagram find-friends import (M18): a step-by-step guide to Instagram's
// own "Descarga tu información" export, then a local file pick + parse (no
// upload — see lib/instagramImport.ts's own header) and a match against
// Mesa's own @handle column. Handles are unverified by construction (an
// Instagram export can't prove who owns a Mesa handle), so every result is
// framed as a suggestion — Seguir, never an auto-follow.
export default function InstagramImportScreen() {
  const t = useT()
  const invite = useInviteLink()
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<ContactMatchUser[] | null>(null)
  const [unmatchedCount, setUnmatchedCount] = useState(0)

  async function pickAndImport() {
    if (picking) return
    setPicking(true)
    setError(null)
    setMatches(null)
    try {
      const picked = await File.pickFileAsync({
        mimeTypes: ['application/zip', 'application/json', 'text/json'],
      })
      if (picked.canceled) return

      const buffer = await picked.result.arrayBuffer()
      const handles = await parseInstagramExport(new Uint8Array(buffer), picked.result.name)
      if (handles.length === 0) {
        setError(t('instagram.no_handles_found'))
        return
      }

      const { matches: found } = await api.post<{ matches: ContactMatchUser[] }>(
        '/social/instagram/match',
        { handles },
      )
      setMatches(found)
      setUnmatchedCount(handles.length - found.length)
    } catch (err) {
      captureError(err, 'friends.instagramImport')
      setError(t('instagram.import_error'))
    } finally {
      setPicking(false)
    }
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-5 pb-10"
      contentInsetAdjustmentBehavior="automatic"
    >
      <Title className="mt-4">{t('instagram.title')}</Title>
      <Body className="mt-1">{t('instagram.subtitle')}</Body>

      <Card className="mt-4 gap-3">
        <Eyebrow>{t('instagram.how_to_title')}</Eyebrow>
        <Step n={1} text={t('instagram.step1')} />
        <Step n={2} text={t('instagram.step2')} />
        <Step n={3} text={t('instagram.step3')} />
        <Step n={4} text={t('instagram.step4')} />
      </Card>

      <Button className="mt-4" disabled={picking} loading={picking} onPress={pickAndImport}>
        {t('instagram.pick_file')}
      </Button>

      {error ? <Caption className="mt-2 text-status-packed">{error}</Caption> : null}

      {matches ? (
        <View className="mt-6">
          <Eyebrow>
            {matches.length > 0
              ? t('instagram.matches_found', { n: matches.length })
              : t('instagram.no_matches')}
          </Eyebrow>
          {matches.map((u) => (
            <PersonRow
              key={u.id}
              user={u}
              subtitle={t('instagram.matched_subtitle', { handle: u.handle ?? '' })}
              right={<FollowPill userId={u.id} initial={false} from="find_friends" />}
            />
          ))}
          {unmatchedCount > 0 ? (
            <Card className="mt-4 gap-2">
              <Body>{t('instagram.unmatched_count', { n: unmatchedCount })}</Body>
              <Button variant="secondary" disabled={invite.sharing} onPress={invite.share}>
                {t('friends.invite_title')}
              </Button>
            </Card>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-pill bg-accent-fill">
        <Text className="font-ui-semibold text-micro text-on-accent">{n}</Text>
      </View>
      <Body className="flex-1">{text}</Body>
    </View>
  )
}
