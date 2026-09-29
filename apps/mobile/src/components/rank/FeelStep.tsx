import { useCallback, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton, MAX_SCALE, Serif } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { ArrowRightIcon, CloseIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { STOP_SENTIMENT, sentimentToStop, wordOpacity } from '@/lib/feel'
import { useT } from '@/lib/i18n'
import type { Sentiment } from '@/lib/pairwise'
import { useLift } from '@/theme/useLift'

import { FeelSlider } from './FeelSlider'
import { Flute } from './Flute'

// "How was it?" — the first question of the rank flow: a champagne flute that goes flat, then
// gains a thin stream, then fizzes, as a slider under it moves between "didn't love it", "it was
// fine" and "loved it". The answer is written large under the glass, and — once there are three
// places on the list to compare against — a line says which third of the list it will go in,
// because that is all the answer decides (the score itself comes from the comparisons after).
//
// It opens on "it was fine" with Next already enabled: most places are, and nobody should have to
// move something to get on. "Add a note" opens a field right here, INLINE — the Sheet and the
// Toaster can't be drawn over the native modal this screen lives in.
export function FeelStep({
  placeName,
  placeCoverId,
  listSize,
  initial,
  note,
  onNote,
  onNext,
  onClose,
}: {
  placeName: string
  placeCoverId: string | null | undefined
  // How many places you have ranked (the list this one is about to join).
  listSize: number
  initial: Sentiment
  note: string
  onNote: (note: string) => void
  onNext: (sentiment: Sentiment) => void
  onClose: () => void
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const lift = useLift()
  const start = sentimentToStop(initial)
  const level = useSharedValue<number>(start)
  const [stop, setStop] = useState<0 | 1 | 2>(start)
  const [noteOpen, setNoteOpen] = useState(false)
  const [fluteBox, setFluteBox] = useState(0)

  const words = [
    t('rank.sentiment_disliked'),
    t('rank.sentiment_fine'),
    t('rank.sentiment_loved'),
  ] as const
  const ranges = [t('rank.range_disliked'), t('rank.range_fine'), t('rank.range_loved')] as const
  // The flute fills the room the question and the controls leave it, up to the size it was drawn.
  const fluteSize = Math.max(0, Math.min(300, Math.floor(fluteBox)))
  const next = useCallback(() => onNext(STOP_SENTIMENT[stop] ?? 'fine'), [onNext, stop])

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-bg"
    >
      <View className="flex-1" style={{ paddingTop: Math.max(insets.top, 12) + 8 }}>
        <View className="flex-row items-center justify-between px-4">
          <IconButton
            accessibilityLabel={t('rank.feel_close')}
            onPress={onClose}
            icon={<CloseIcon size={18} color="text" />}
          />
          <View
            className="h-9 max-w-[62%] flex-row items-center gap-2 rounded-pill bg-chip pl-1.5 pr-3.5"
            style={lift}
          >
            {/* A photo, if there is one — a name card is unreadable at 26pt, and the name is
                right beside it. */}
            {placeCoverId ? (
              <View className="h-[26px] w-[26px] overflow-hidden rounded-pill">
                <PlaceCover
                  name={placeName}
                  coverImageId={placeCoverId}
                  size={{ w: 60, h: 60 }}
                  className="h-full w-full rounded-none"
                />
              </View>
            ) : (
              <View className="w-1.5" />
            )}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="shrink font-ui-semibold text-pill text-text"
            >
              {placeName}
            </Text>
          </View>
          <View className="h-[42px] w-[42px]" />
        </View>

        <Serif className="mt-5 text-center text-title text-text">{t('rank.sentiment_title')}</Serif>

        {noteOpen ? null : (
          <>
            <View
              className="min-h-[120px] flex-1 items-center justify-center"
              onLayout={(e) => setFluteBox(e.nativeEvent.layout.height)}
            >
              {fluteSize > 0 ? <Flute level={level} size={fluteSize} /> : null}
            </View>

            <View className="h-14">
              {words.map((w, j) => (
                <AnswerWord key={j} text={w} stop={j} level={level} />
              ))}
            </View>
            <View className="mt-2.5 h-5">
              {listSize >= 3
                ? ranges.map((r, j) => <RangeLine key={j} text={r} stop={j} level={level} />)
                : null}
            </View>
          </>
        )}

        <View className="mb-7 mt-6 items-center">
          <FeelSlider
            level={level}
            initial={start}
            labels={words}
            onStop={setStop}
            label={t('rank.sentiment_title')}
          />
        </View>

        {noteOpen ? (
          <View className="mt-5 px-5">
            <Field
              multilineBox
              autoFocus
              value={note}
              onChangeText={onNote}
              maxLength={140}
              placeholder={t('rank.note_placeholder')}
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              onBlur={() => setNoteOpen(false)}
            />
          </View>
        ) : null}
      </View>

      <View
        className="mx-[18px] h-[62px] flex-row items-center rounded-[31px] bg-chip pl-[22px] pr-1.5"
        style={[lift, { marginBottom: Math.max(insets.bottom, 12) + 4 }]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => setNoteOpen(true)}
          hitSlop={8}
          className="min-w-0 flex-1 justify-center self-stretch active:opacity-70"
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className={`font-ui-semibold text-body ${note.trim() ? 'text-text-2' : 'text-text'}`}
          >
            {note.trim() ? `“${note.trim()}”` : t('rank.feel_add_note')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={next}
          className="h-[50px] flex-row items-center gap-2 rounded-pill bg-ink px-6 active:opacity-85"
        >
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui-semibold text-body text-on-ink"
          >
            {t('rank.feel_next')}
          </Text>
          <ArrowRightIcon size={17} color="on-ink" strokeWidth={2.2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

// The answer, in the serif at 54: the word for the stop the knob is on, fading up into place as
// the knob arrives and away as it leaves (an 8pt rise either side).
function AnswerWord({
  text,
  stop,
  level,
}: {
  text: string
  stop: number
  level: SharedValue<number>
}) {
  const style = useAnimatedStyle(() => {
    const o = wordOpacity(level.value, stop)
    return { opacity: o, transform: [{ translateY: 8 * (1 - o) }] }
  })
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center' }, style]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.1}
        className="px-5 text-center font-serif text-answer text-text"
      >
        {text}
      </Text>
    </Animated.View>
  )
}

// "Goes in the top third of your list", under the word it belongs to.
function RangeLine({
  text,
  stop,
  level,
}: {
  text: string
  stop: number
  level: SharedValue<number>
}) {
  const style = useAnimatedStyle(() => ({ opacity: wordOpacity(level.value, stop) }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center' }, style]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="font-ui text-label text-text-muted"
      >
        {text}
      </Text>
    </Animated.View>
  )
}
