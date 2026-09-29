import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

import { PhotoChip, photoChipText } from '@/components/feed/PhotoChip'
import { Caption, MAX_SCALE, SectionHeader } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { ScoreBadge } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import type { HomeResponse } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// "Tonight's pick": what stands in for the event card on a night with no events — the
// place still open late that a friend of yours ranked highest. Same card as an event's,
// a little shorter (300 tall), with the friend's score in the panel.
//
// Picture rule: with no photo the card is the place's NAME CARD, and the panel then leaves
// the name out — it would only say it twice.
type Pick = Extract<NonNullable<HomeResponse['tonight']>, { kind: 'pick' }>

export function TonightPick({ pick }: { pick: Pick }) {
  const t = useT()
  const router = useRouter()
  const scrim = useColor('photo-scrim')
  const { restaurant: r } = pick
  const hasPhoto = imageUrl(r.coverImageId) !== null
  // The API sends the friend's full name; the card only ever says the first.
  const first = pick.friend.name.trim().split(/\s+/)[0] ?? pick.friend.name
  const by =
    pick.friendCount > 1
      ? t('home.pick_by_friends', { name: first, n: pick.friendCount - 1 })
      : t('home.pick_by_friend', { name: first })
  return (
    <View>
      <View className="px-5">
        <SectionHeader action={<Caption>{t('home.tonight_none')}</Caption>}>
          {t('home.tonight')}
        </SectionHeader>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/r/${r.id}`)}
        className="mx-5 h-[300px] overflow-hidden rounded-[32px] bg-bg-sunk active:opacity-95"
      >
        <PlaceCover
          name={r.name}
          coverImageId={r.coverImageId}
          size={{ w: 900, h: 700 }}
          className="absolute inset-0 h-full w-full rounded-none"
        />
        {hasPhoto ? (
          <LinearGradient
            colors={['transparent', scrim]}
            locations={[0.45, 1]}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.55 }}
          />
        ) : null}
        <PhotoChip
          onPhoto={hasPhoto}
          radius={17}
          className="absolute left-3.5 top-3.5 h-[34px] justify-center px-3.5"
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className={`font-ui-semibold text-label ${photoChipText(hasPhoto)}`}
          >
            {t('home.tonight_pick')}
          </Text>
        </PhotoChip>
        <Glass
          variant="panel"
          radius={24}
          className="absolute inset-x-2.5 bottom-2.5 px-4 pb-3.5 pt-[15px]"
        >
          <View className="flex-row items-center justify-between gap-3">
            {hasPhoto ? (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_SCALE}
                className="shrink font-serif text-title text-hglass-fg"
              >
                {r.name}
              </Text>
            ) : (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_SCALE}
                className="shrink font-ui-medium text-label text-hglass-fg"
              >
                {by}
              </Text>
            )}
            <ScoreBadge size="sm" score={pick.score} attribution={{ kind: 'stated' }} />
          </View>
          {hasPhoto ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-1 font-ui text-label text-hglass-fg opacity-70"
            >
              {[by, r.cuisine, r.neighborhood].filter(Boolean).join(' · ')}
            </Text>
          ) : (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-1 font-ui text-label text-hglass-fg opacity-70"
            >
              {[r.cuisine, r.neighborhood].filter(Boolean).join(' · ')}
            </Text>
          )}
        </Glass>
      </Pressable>
    </View>
  )
}
