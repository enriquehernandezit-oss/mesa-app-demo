import { type ReactNode, useEffect, useState } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton, MAX_SCALE } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { BackIcon, ShareIcon } from '@/components/ui/icons'
import { ScoreBadge } from '@/components/ui/patterns'
import { useT } from '@/lib/i18n'
import { displayScore, scoreWordKey } from '@/lib/score'
import { DATA_FIGURES } from '@/theme/vars'

// The place page's fixed top chrome, in two states that trade places as the details sheet
// rises: over the photo, a frosted back button, the score ("8.0 Great · Mesa") and share; once
// the sheet reaches the top, a solid bar — back, the name, the score. Both are driven by the
// page's scroll (`scrollY`); the flag that gates their touch targets lives HERE, so flipping
// it re-renders only this component, not the page's rails mid-fling (the page reaches it
// through `setterRef`).
export function PlaceTopChrome({
  name,
  score,
  who,
  mesaCount,
  onBack,
  onShare,
  onTop,
  scrollY,
  fadeStart,
  fadeEnd,
  setterRef,
}: {
  name: string
  // The score shown on the photo, 0–100, and whose it is ("Mesa" / "Friends"); null hides it.
  score: number | null
  who: string
  mesaCount: number
  onBack: () => void
  onShare: () => void
  onTop: () => void
  scrollY: Animated.Value
  fadeStart: number
  fadeEnd: number
  setterRef: React.MutableRefObject<((v: boolean) => void) | null>
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const [condensed, setCondensed] = useState(false)
  useEffect(() => {
    setterRef.current = setCondensed
    return () => {
      setterRef.current = null
    }
  }, [setterRef])
  const solid = scrollY.interpolate({
    inputRange: [fadeStart, fadeEnd],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  const glass = scrollY.interpolate({
    inputRange: [fadeStart, fadeEnd],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  return (
    <>
      <Animated.View
        pointerEvents={condensed ? 'none' : 'box-none'}
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: glass,
        }}
      >
        <View className="flex-row items-center gap-2">
          <HeroButton label={t('common.back_plain')} onPress={onBack}>
            <BackIcon size={20} color="hglass-fg" />
          </HeroButton>
          {score != null ? <ScoreGlass score={score} who={who} /> : null}
        </View>
        <HeroButton label={t('common.share')} onPress={onShare}>
          <ShareIcon size={18} color="hglass-fg" />
        </HeroButton>
      </Animated.View>

      <Animated.View
        pointerEvents={condensed ? 'auto' : 'none'}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: solid }}
      >
        <Glass
          solid
          variant="bar"
          radius={0}
          style={{
            borderWidth: 0,
            borderBottomWidth: 1,
            paddingTop: insets.top + 8,
            paddingBottom: 10,
            paddingHorizontal: 16,
          }}
        >
          <View className="flex-row items-center gap-2.5">
            <IconButton
              size={40}
              accessibilityLabel={t('common.back_plain')}
              onPress={onBack}
              icon={<BackIcon size={19} color="text" />}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('restaurant.scroll_to_top')}
              onPress={onTop}
              className="flex-1 active:opacity-70"
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-serif text-serif-md text-text"
              >
                {name}
              </Text>
            </Pressable>
            {score != null ? (
              <ScoreBadge
                size="sm"
                score={score}
                attribution={{ kind: 'mesa', count: mesaCount }}
              />
            ) : null}
          </View>
        </Glass>
      </Animated.View>
    </>
  )
}

// A round control laid on the photo: frosted glass (white frost by day, smoked at night).
function HeroButton({
  label,
  onPress,
  children,
}: {
  label: string
  onPress: () => void
  children: ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      className="active:opacity-80"
    >
      <Glass variant="panel" radius={22} className="h-[44px] w-[44px] items-center justify-center">
        {children}
      </Glass>
    </Pressable>
  )
}

// "8.0 Great · Mesa" — the score as glass on the photo: the number, its word, and whose it is.
function ScoreGlass({ score, who }: { score: number; who: string }) {
  const t = useT()
  return (
    <Glass variant="panel" radius={22} className="h-[44px] flex-row items-center gap-1.5 px-[15px]">
      <Text
        style={DATA_FIGURES}
        maxFontSizeMultiplier={MAX_SCALE}
        className="font-serif text-serif-md text-hglass-fg"
      >
        {displayScore(score)}
      </Text>
      <Text className="font-ui-semibold text-label text-hglass-fg">{t(scoreWordKey(score))}</Text>
      <Text className="font-ui text-meta text-hglass-fg opacity-60">· {who}</Text>
    </Glass>
  )
}
