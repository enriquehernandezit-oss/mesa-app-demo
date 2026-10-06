import { File } from 'expo-file-system'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'

import { MutualLine } from '@/components/MutualLine'
import { FollowPill, PersonRow } from '@/components/PersonRow'
import { Group } from '@/components/SettingsRow'
import { Body, Button, Caption, MAX_SCALE, SectionHeader } from '@/components/ui'
import { DownloadIcon } from '@/components/ui/icons'
import { useInviteLink } from '@/hooks/useInviteLink'
import { ApiError, api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { parseInstagramExport } from '@/lib/instagramImport'
import type { ContactMatchUser } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// Instagram find-friends import (M18): a step-by-step guide to Instagram's
// own "Descarga tu información" export, then a local file pick + parse (no
// upload — see lib/instagramImport.ts's own header) and a match against
// Mesa's own @handle column. Handles are unverified by construction (an
// Instagram export can't prove who owns a Mesa handle), so every result is
// framed as a suggestion — Seguir, never an auto-follow. Redesign 2: the serif title, one raised
// card with the four steps, a solid Choose file, and the matches as one grouped list.
const HANDLE_BATCH = 2000

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

      // The server refuses a handle over 60 characters (the whole request with it, so one stray
      // value in a big export used to turn the import into a generic error) and a batch over 5000.
      // Send what it can read, in batches.
      const sendable = handles.filter((h) => h.length <= 60)
      const found: ContactMatchUser[] = []
      for (let i = 0; i < sendable.length; i += HANDLE_BATCH) {
        const res = await api.post<{ matches: ContactMatchUser[] }>('/social/instagram/match', {
          handles: sendable.slice(i, i + HANDLE_BATCH),
        })
        found.push(...res.matches)
      }
      setMatches(found)
      setUnmatchedCount(Math.max(0, handles.length - found.length))
    } catch (err) {
      captureError(err, 'friends.instagramImport')
      setError(
        err instanceof ApiError && err.status === 429
          ? t('friends.contacts_rate_limited')
          : t('instagram.import_error'),
      )
    } finally {
      setPicking(false)
    }
  }

  const lift = useLift()
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 pb-10"
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className="mt-4 px-1 font-serif text-serif-lg text-text"
      >
        {t('instagram.title')}
      </Text>
      <Body className="mt-1.5 px-1 text-subhead">{t('instagram.subtitle')}</Body>

      <View className="mt-5 rounded-card bg-surface p-4" style={lift}>
        <Caption className="pb-1 font-ui-semibold">{t('instagram.how_to_title')}</Caption>
        <Step n={1} text={t('instagram.step1')} />
        <Step n={2} text={t('instagram.step2')} />
        <Step n={3} text={t('instagram.step3')} />
        <Step n={4} text={t('instagram.step4')} />
      </View>

      <Button
        className="mt-3.5"
        icon={<DownloadIcon size={18} color="on-ink" />}
        disabled={picking}
        loading={picking}
        onPress={pickAndImport}
      >
        {t('instagram.pick_file')}
      </Button>

      {error ? <Caption className="mt-2 text-danger">{error}</Caption> : null}

      {matches ? (
        <View>
          <View className="px-1">
            <SectionHeader>
              {matches.length > 0
                ? t('instagram.matches_found', { n: matches.length })
                : t('instagram.no_matches')}
            </SectionHeader>
          </View>
          {matches.length > 0 ? (
            <Group>
              {matches.map((u, i) => (
                <PersonRow
                  key={u.id}
                  user={u}
                  subtitle={t('instagram.matched_subtitle', { handle: u.handle ?? '' })}
                  below={<MutualLine userId={u.id} mutual={u.mutual} />}
                  right={<FollowPill userId={u.id} initial={false} from="find_friends" />}
                  last={i === matches.length - 1}
                />
              ))}
            </Group>
          ) : null}
          {unmatchedCount > 0 ? (
            <View className="mt-3 gap-2 rounded-card bg-surface p-4" style={lift}>
              <Body>{t('instagram.unmatched_count', { n: unmatchedCount })}</Body>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px] border border-line"
                disabled={invite.sharing}
                onPress={invite.share}
              >
                {t('friends.invite_title')}
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View className="flex-row items-start gap-3 py-[7px]">
      <View className="h-[26px] w-[26px] items-center justify-center rounded-pill bg-ink">
        <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-label text-on-ink">
          {n}
        </Text>
      </View>
      <Body className="flex-1 pt-[3px] text-subhead">{text}</Body>
    </View>
  )
}
