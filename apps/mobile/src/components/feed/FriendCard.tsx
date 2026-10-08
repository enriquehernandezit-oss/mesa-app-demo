import { useMutation } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { type Href, useRouter } from 'expo-router'
import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { CheersButton } from '@/components/CheersButton'
import { MentionText } from '@/components/MentionText'
import { pickReportReason } from '@/components/ReportControl'
import { SaveButton } from '@/components/SaveButton'
import { MAX_SCALE } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { CommentIcon, MoreIcon } from '@/components/ui/icons'
import { ScoreBadge } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import { timeAgo } from '@/lib/time'
import type { FeedItem } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// A friend's ranking, as one card. Two shapes, by what there is to show — the
// picture rule (docs/DESIGN.md): the friend's photo or the place's photo on the right,
// fading into the card; else no picture at all — their WORDS lead, or, with none, the
// place's name does. A place with no photo never gets a name card here. Under the place: the friend's note (or the neighborhood), then a dense line —
// cheers, comments, save. The whole card opens the place (or the dish, for a dish
// post); the avatar, the "···" and each action keep their own targets.
//
// Memoized, with the Feed's renderItem hoisted: a screen-level re-render (pull to
// refresh, the next page, one cheers tap) doesn't re-render every mounted card.

// Only the first screenful rises in, and each card only ever once: FlatList re-mounts
// cells as they scroll back into view, which used to replay a delayed fade on screen.
const animatedPosts = new Set<string>()
function entering(id: string, index: number) {
  if (index >= 6 || animatedPosts.has(id)) return undefined
  animatedPosts.add(id)
  return FadeInDown.duration(280).delay(index * 60)
}

export const FriendCard = memo(function FriendCard({
  item,
  index = 0,
}: {
  item: FeedItem
  index?: number
}) {
  const t = useT()
  const router = useRouter()
  const lift = useLift()
  const surface = useColor('surface')
  const firstName = (item.user.name || item.user.handle || 'm').split(' ')[0] ?? 'm'
  const isDish = Boolean(item.dishImage)
  const href: Href = isDish && item.dishId ? `/dish/${item.dishId}` : `/r/${item.restaurant.id}`
  const openComments = () => router.push(`/comments/${item.rankingId}`)
  const commentCount = item.commentCount ?? 0
  const photo = imageUrl(item.dishImage ?? item.restaurant.coverImageId, { w: 420, h: 420 })
  // "at {place}" / "en {place}" with the place picked out in the text color.
  const atPlace = t('feed.at_place', { place: '\u0000' }).split('\u0000')
  const title =
    isDish && item.dishName ? `${item.dishName} · ${item.restaurant.name}` : item.restaurant.name

  // Reporting the note (App Store 1.2). Two ways into the same sheet: the "···" in
  // the card's top line, because 1.2 wants reporting "clearly available" and a
  // long-press nobody can see isn't, and the long-press on the note itself, kept
  // because people already reach for it.
  const reportNote = useMutation({
    mutationFn: ({ reason, noteId }: { reason: string; noteId: string }) =>
      api.post('/moderation/reports', { targetType: 'vibe_note', targetId: noteId, reason }),
    onSuccess: () => toast({ message: t('common.reported') }),
    onError: () => toast({ variant: 'error', message: t('common.report_error') }),
  })
  const noteId = item.noteId
  const onReportNote =
    item.note && noteId
      ? async () => {
          const reason = await pickReportReason('vibe_note')
          if (reason) reportNote.mutate({ reason, noteId })
        }
      : undefined

  const who = (
    <View className="flex-row items-center gap-[7px]">
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.push(`/u/${item.user.id}`)}
        className="flex-row items-center gap-[7px] active:opacity-70"
      >
        <Avatar name={item.user.name || item.user.handle || 'm'} src={item.user.image} size={20} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className="shrink font-ui-semibold text-meta text-text"
        >
          {firstName}
        </Text>
      </Pressable>
      <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-meta text-text-muted">
        · {isDish ? `${t('discover.posted_dish')} · ` : ''}
        {timeAgo(item.rankedAt)}
      </Text>
      <View className="flex-1" />
      {onReportNote ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('report.note_a11y')}
          onPress={onReportNote}
          hitSlop={10}
          className="items-center justify-center active:opacity-60"
        >
          <MoreIcon size={18} color="text-faint" />
        </Pressable>
      ) : null}
    </View>
  )

  // The actions are filled chips, so they read at a glance — the first version was 15pt grey
  // outlines on the card and was close to invisible. SAVE sits in the card's bottom-right
  // corner: over the photo (frosted, like the dish hero's) or the name card for those shapes,
  // and at the end of this row for the words-only shape, whose row already spans that corner.
  const save = (variant: 'photo' | 'chip') =>
    isDish && item.dishId ? (
      <SaveButton
        variant={variant}
        target={{ kind: 'dish', id: item.dishId }}
        initial={item.dishSaved ?? false}
        name={item.dishName || item.restaurant.name}
      />
    ) : (
      <SaveButton
        variant={variant}
        target={{ kind: 'restaurant', id: item.restaurant.id }}
        initial={item.restaurantSaved ?? false}
        name={item.restaurant.name}
      />
    )

  const actions = (saveInRow: boolean) => (
    <View className="mt-2 flex-row items-center gap-2">
      <CheersButton
        variant="chip"
        target={{ kind: 'ranking', id: item.rankingId }}
        count={item.cheersCount ?? 0}
        cheered={item.cheeredByMe ?? false}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('comments.open')}
        onPress={openComments}
        hitSlop={4}
        className="h-9 min-w-[44px] flex-row items-center justify-center gap-1.5 rounded-pill bg-bg px-3 active:opacity-70"
      >
        <CommentIcon size={18} color="text-2" />
        {commentCount > 0 ? (
          <Text
            style={DATA_FIGURES}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui-semibold text-label text-text-2"
          >
            {commentCount}
          </Text>
        ) : null}
      </Pressable>
      {saveInRow ? (
        <>
          <View className="flex-1" />
          {save('chip')}
        </>
      ) : null}
    </View>
  )

  const shell = 'mx-4 mb-2.5 rounded-card bg-surface active:opacity-90'
  const body = (
    <>
      {who}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="mt-1.5 font-serif text-serif-md text-text"
      >
        {title}
      </Text>
    </>
  )

  return (
    <Animated.View entering={entering(item.rankingId, index)}>
      {photo ? (
        // Photo on the right, fading into the card; the score sits on it as dark glass.
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(href)}
          className={shell}
          style={lift}
        >
          <View className="min-h-[112px] overflow-hidden rounded-card">
            <View className="absolute inset-y-0 right-0 w-[150px]">
              <Image
                source={{ uri: photo }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={120}
              />
              <LinearGradient
                colors={[surface, `${surface}00`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.5, y: 0 }}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />
            </View>
            <View className="absolute right-2.5 top-2.5">
              <ScoreBadge
                size="sm"
                kind="photo"
                score={item.score}
                attribution={{ kind: 'stated' }}
              />
            </View>
            <View className="pb-2.5 pl-4 pr-[158px] pt-3">
              {body}
              <Text
                selectable
                numberOfLines={1}
                onLongPress={onReportNote}
                maxFontSizeMultiplier={MAX_SCALE}
                className="mt-0.5 font-ui text-label text-text-2"
              >
                {item.note ? <MentionText text={item.note} /> : item.neighborhood}
              </Text>
              {actions(false)}
            </View>
            <View className="absolute bottom-2.5 right-2.5">{save('photo')}</View>
          </View>
        </Pressable>
      ) : (
        // No photo: no picture. Their words lead when they said something; otherwise the
        // place's name does, and the neighborhood sits under it.
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(href)}
          className={`${shell} px-4 pb-2.5 pt-3`}
          style={lift}
        >
          <View className="flex-row items-center gap-2">
            <View className="flex-1">{who}</View>
            <ScoreBadge size="sm" score={item.score} attribution={{ kind: 'stated' }} />
          </View>
          {item.note ? (
            <>
              <Text
                selectable
                numberOfLines={3}
                onLongPress={onReportNote}
                maxFontSizeMultiplier={MAX_SCALE}
                className="mt-2 font-serif text-serif-md text-text"
              >
                “<MentionText text={item.note} />”
              </Text>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_SCALE}
                className="mt-1 font-ui text-label text-text-muted"
              >
                {atPlace[0]}
                <Text maxFontSizeMultiplier={MAX_SCALE} className="text-text">
                  {title}
                </Text>
                {atPlace[1]}
                {item.neighborhood ? ` · ${item.neighborhood}` : ''}
              </Text>
            </>
          ) : (
            <>
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={MAX_SCALE}
                className="mt-2 font-serif text-serif-md text-text"
              >
                {title}
              </Text>
              {item.neighborhood ? (
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="mt-0.5 font-ui text-label text-text-muted"
                >
                  {item.neighborhood}
                </Text>
              ) : null}
            </>
          )}
          {actions(true)}
        </Pressable>
      )}
    </Animated.View>
  )
})
