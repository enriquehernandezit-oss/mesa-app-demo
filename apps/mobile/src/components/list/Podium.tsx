import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { ScoreBadge } from '@/components/ui/patterns'
import { cuisineLabel, displayScore, priceLabel, scoreWordKey } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import type { Ranking } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { DATA_FIGURES } from '@/theme/vars'

import { openRankingActions } from './rankingActions'

// Your top three, as the head of Your list (My order, no filters): #1 a wide r30 card, #2 and
// #3 half-width tiles under it. Each is the place's photo under a dark fade with its position
// set huge in the serif — or, with no photo, a plain raised card with the numeral ghosted
// behind the name (docs/DESIGN.md's picture rule). Tap opens the place; a long press opens the
// actions (rank again, remove).
export function Podium({ items }: { items: Ranking[] }) {
  const [first, second, third] = items
  if (!first) return null
  return (
    <View className="-mx-1 gap-2.5 pb-1">
      <BigTile ranking={first} />
      {second ? (
        <View className="flex-row gap-2.5">
          <HalfTile ranking={second} />
          {third ? <HalfTile ranking={third} /> : null}
        </View>
      ) : null}
    </View>
  )
}

function useTile(ranking: Ranking) {
  const router = useRouter()
  const t = useT()
  const photo = imageUrl(ranking.restaurant.coverImageId, { w: 900, h: 600 })
  return {
    photo,
    // Over a photo the type is cream; on the plain card it is the page's ink.
    ink: photo ? 'text-on-photo' : 'text-text',
    numeralColor: photo ? 'text-on-photo' : 'text-text',
    numeralOpacity: photo ? 0.92 : 0.14,
    open: () => router.push(`/r/${ranking.restaurant.id}`),
    actions: () => openRankingActions(ranking, t, router),
    label: `${ranking.position}. ${ranking.restaurant.name}, ${displayScore(ranking.score)}`,
  }
}

// The fade that darkens the lower part of a photo so cream type reads on it.
function Fade() {
  const scrim = useColor('photo-scrim')
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['transparent', scrim]}
      locations={[0.38, 1]}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
    />
  )
}

function BigTile({ ranking }: { ranking: Ranking }) {
  const t = useT()
  const tile = useTile(ranking)
  const meta = [
    cuisineLabel(ranking.restaurant.cuisine),
    ranking.neighborhood,
    priceLabel(ranking.restaurant.priceTier),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      onPress={tile.open}
      onLongPress={tile.actions}
      className={`h-[204px] overflow-hidden rounded-hero active:opacity-90 ${tile.photo ? 'bg-bg-sunk' : 'border border-line bg-surface-raised'}`}
    >
      {tile.photo ? (
        <>
          <Image
            source={{ uri: tile.photo }}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            contentFit="cover"
            transition={120}
          />
          <Fade />
        </>
      ) : null}
      {/* The position, as a graphic: it bleeds off the bottom edge, so it doesn't follow the
          text-size setting. */}
      <Text
        style={[
          DATA_FIGURES,
          {
            position: 'absolute',
            left: 14,
            bottom: -16,
            fontSize: 168,
            lineHeight: 168,
            opacity: tile.numeralOpacity,
          },
        ]}
        allowFontScaling={false}
        className={`font-serif ${tile.numeralColor}`}
      >
        {ranking.position}
      </Text>
      <View className="absolute bottom-[18px] left-[112px] right-[92px]">
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={MAX_SCALE}
          className={`font-serif text-title ${tile.ink}`}
        >
          {ranking.restaurant.name}
        </Text>
        {meta ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className={`mt-1 font-ui text-meta opacity-75 ${tile.ink}`}
          >
            {meta}
          </Text>
        ) : null}
      </View>
      <View className="absolute bottom-4 right-[18px] items-end">
        <Text
          style={DATA_FIGURES}
          maxFontSizeMultiplier={MAX_SCALE}
          className={`font-serif text-display ${tile.ink}`}
        >
          {displayScore(ranking.score)}
        </Text>
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className={`mt-0.5 font-ui-semibold text-eyebrow opacity-80 ${tile.ink}`}
        >
          {t(scoreWordKey(ranking.score))}
        </Text>
      </View>
    </Pressable>
  )
}

function HalfTile({ ranking }: { ranking: Ranking }) {
  const tile = useTile(ranking)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      onPress={tile.open}
      onLongPress={tile.actions}
      className={`h-[146px] flex-1 overflow-hidden rounded-[26px] active:opacity-90 ${tile.photo ? 'bg-bg-sunk' : 'border border-line bg-surface-raised'}`}
    >
      {tile.photo ? (
        <>
          <Image
            source={{ uri: tile.photo }}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            contentFit="cover"
            transition={120}
          />
          <Fade />
        </>
      ) : null}
      <Text
        style={[
          DATA_FIGURES,
          {
            position: 'absolute',
            left: 12,
            bottom: -8,
            fontSize: 90,
            lineHeight: 90,
            opacity: tile.numeralOpacity,
          },
        ]}
        allowFontScaling={false}
        className={`font-serif ${tile.numeralColor}`}
      >
        {ranking.position}
      </Text>
      <View className="absolute right-2.5 top-2.5">
        <ScoreBadge
          size="sm"
          word={false}
          kind={tile.photo ? 'photo' : 'solid'}
          score={ranking.score}
          attribution={{ kind: 'stated' }}
        />
      </View>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={MAX_SCALE}
        className={`absolute bottom-3.5 left-[58px] right-2.5 font-serif text-serif-sm ${tile.ink}`}
      >
        {ranking.restaurant.name}
      </Text>
    </Pressable>
  )
}
