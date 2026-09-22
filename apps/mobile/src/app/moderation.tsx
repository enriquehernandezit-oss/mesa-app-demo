import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Redirect, Stack, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Caption, EmptyState, ErrorState, RowsSkeleton } from '@/components/ui'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { showActionSheet } from '@/lib/actionSheet'
import { api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { cloudinaryUrl } from '@/lib/media'
import { timeAgo } from '@/lib/time'
import type { ModerationReport } from '@/lib/types'

// The moderation queue (App Store 1.2). Until this screen existed, a member
// could report a note and it went nowhere: the four moderator endpoints had no
// caller and `status` never left 'open'. Reporting that visibly does nothing is
// worse than not offering it.
//
// Moderator-only, and the gate is the server's: `isModerator` comes from GET /me
// and every endpoint behind this screen re-checks it (requireModerator). The
// redirect below is a courtesy, not the security boundary — there is no way to
// grant yourself the flag from inside the product.
const TYPE_KEYS: Record<
  ModerationReport['targetType'],
  | 'moderation.type_vibe_note'
  | 'moderation.type_dish'
  | 'moderation.type_user'
  | 'moderation.type_comment'
> = {
  vibe_note: 'moderation.type_vibe_note',
  dish: 'moderation.type_dish',
  comment: 'moderation.type_comment',
  user: 'moderation.type_user',
}

// A report this build has no action for. Thrown rather than falling through to
// the eject endpoint the way the old if-chain did: every unrecognized type
// ended at `POST /moderation/users/:targetId/eject`, so acting on a comment
// report sent the COMMENT's id to the ban endpoint — it matched no user, the
// queue claimed "retirado", the comment stayed up and the report stayed open.
// An unknown type now touches nothing and says so.
class UnknownReportType extends Error {}

export default function ModerationQueue() {
  const t = useT()
  const { data: me, isPending: meLoading } = useProfile(true)
  const queryClient = useQueryClient()

  const q = useQuery({
    queryKey: ['moderation-reports'],
    queryFn: () => api.get<{ reports: ModerationReport[] }>('/moderation/reports'),
    enabled: Boolean(me?.profile.isModerator),
  })

  const act = useMutation({
    mutationFn: ({
      report,
      action,
    }: {
      report: ModerationReport
      action: 'remove' | 'dismiss'
    }) => {
      if (action === 'dismiss') return api.post(`/moderation/reports/${report.id}/dismiss`)
      switch (report.targetType) {
        case 'vibe_note':
          return api.del(`/moderation/vibe-notes/${report.targetId}`)
        case 'dish':
          return api.del(`/moderation/dishes/${report.targetId}`)
        case 'comment':
          return api.del(`/moderation/comments/${report.targetId}`)
        case 'user':
          return api.post(`/moderation/users/${report.targetId}/eject`)
        default:
          throw new UnknownReportType()
      }
    },
    onSuccess: (_d, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['moderation-reports'] })
      // Removing content changes what everyone else sees — the feed carries
      // it directly, and a removed dish/vibe-note also has to clear off the
      // restaurant's own dish rail and profile, none of which ['feed'] is a
      // prefix of.
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['dishes'] })
      queryClient.invalidateQueries({ queryKey: ['dish'] })
      queryClient.invalidateQueries({ queryKey: ['restaurant'] })
      // A removed comment has to leave its thread and the feed card's
      // count/latest line, which read from ['comments', rankingId].
      queryClient.invalidateQueries({ queryKey: ['comments'] })
      toast({
        message:
          action === 'dismiss' ? t('moderation.dismissed_toast') : t('moderation.removed_toast'),
      })
    },
    onError: (err) => {
      if (err instanceof UnknownReportType) {
        toast({ variant: 'error', message: t('moderation.unknown_type') })
        return
      }
      captureError(err, 'moderation.act')
      toast({ variant: 'error', message: t('moderation.act_error') })
    },
  })

  // Wait for the profile before deciding — redirecting on a not-yet-loaded
  // profile would bounce a real moderator straight back out.
  if (meLoading) return <View className="flex-1 bg-bg" />
  if (!me?.profile.isModerator) return <Redirect href="/discover" />

  const reports = q.data?.reports ?? []

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: t('moderation.title') }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10"
        contentInsetAdjustmentBehavior="automatic"
      >
        {q.isPending ? (
          <RowsSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('moderation.load_error')}</ErrorState>
        ) : reports.length === 0 ? (
          <EmptyState body={t('moderation.empty_body')}>{t('moderation.empty_title')}</EmptyState>
        ) : (
          <>
            <Caption className="mb-3 mt-2 text-micro">
              {t('moderation.open_reports_count', { n: reports.length })}
            </Caption>
            {reports.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                busy={act.isPending}
                onAct={(action) => {
                  const isRemove = action === 'remove'
                  const label =
                    r.targetType === 'user'
                      ? t('moderation.eject_member')
                      : t('moderation.remove_content')
                  showActionSheet({
                    title: isRemove
                      ? t('moderation.confirm_action_title', { label })
                      : t('moderation.confirm_dismiss_title'),
                    message: isRemove
                      ? r.targetType === 'user'
                        ? t('moderation.eject_message')
                        : t('moderation.remove_message')
                      : t('moderation.dismiss_message'),
                    options: [
                      {
                        label: isRemove ? label : t('moderation.dismiss_button'),
                        destructive: isRemove,
                      },
                    ],
                  }).then((picked) => {
                    if (picked === 0) act.mutate({ report: r, action })
                  })
                }}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function ReportRow({
  report,
  busy,
  onAct,
}: {
  report: ModerationReport
  busy: boolean
  onAct: (action: 'remove' | 'dismiss') => void
}) {
  const t = useT()
  const router = useRouter()
  const target = report.target
  return (
    <View className="mb-3 rounded border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Caption className="font-ui-medium text-micro text-accent-strong">
          {t(TYPE_KEYS[report.targetType])}
        </Caption>
        <Caption className="text-micro">{timeAgo(report.createdAt)}</Caption>
      </View>

      {/* The reported content itself — without it there's nothing to judge. */}
      {target === null ? (
        <Caption className="mt-2 text-text-muted">{t('moderation.content_gone')}</Caption>
      ) : target.kind === 'vibe_note' ? (
        // A moderator deciding whether to remove a note previously had no way
        // to see who wrote it — their other rankings, prior reports — without
        // leaving the queue and hand-searching for them.
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/u/${target.userId}`)}
          className="mt-2 active:opacity-70"
        >
          <Text selectable className="font-serif-italic text-serif-sm text-text-2">
            “{target.body}”
          </Text>
        </Pressable>
      ) : target.kind === 'dish' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/dish/${report.targetId}`)}
          className="mt-2 flex-row items-center gap-3 active:opacity-70"
        >
          {target.imageId ? (
            <Image
              source={{ uri: cloudinaryUrl(target.imageId, { w: 200, h: 200 }) ?? undefined }}
              style={{ width: 56, height: 56, borderRadius: 10 }}
              contentFit="cover"
            />
          ) : null}
          <View className="flex-1">
            <Text className="font-serif text-serif-sm text-text">{target.name}</Text>
            {target.caption ? (
              <Text selectable className="font-serif-italic text-serif-sm text-text-2">
                “{target.caption}”
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : target.kind === 'comment' ? (
        // Same reasoning as the note above — the body is what gets judged, and
        // the tap goes to whoever wrote it. Plain UI type, not the note's
        // serif quote: a comment isn't a vibe note.
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/u/${target.userId}`)}
          className="mt-2 active:opacity-70"
        >
          <Text selectable className="font-ui text-body text-text-2">
            {target.body}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/u/${report.targetId}`)}
          className="mt-2 active:opacity-70"
        >
          <Text className="font-ui text-body text-text">
            {target.name}
            {target.handle ? (
              <Text className="text-label text-text-2"> @{target.handle}</Text>
            ) : null}
          </Text>
        </Pressable>
      )}

      <Caption className="mt-2">
        {t('moderation.reason_label')} <Text className="text-text-2">{report.reason}</Text>
      </Caption>

      {report.alreadyHandled ? (
        <Caption className="mt-3 text-micro text-text-muted">
          {t('moderation.already_handled')}
        </Caption>
      ) : null}

      <View className="mt-3 flex-row gap-5">
        {!report.alreadyHandled && target !== null && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onAct('remove')}
            className="min-h-[44px] justify-center active:opacity-60"
          >
            <Text className="font-ui text-eyebrow text-status-packed uppercase tracking-eyebrow">
              {report.targetType === 'user'
                ? t('moderation.eject_button')
                : t('moderation.remove_button')}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onAct('dismiss')}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
            {t('moderation.dismiss_button')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
