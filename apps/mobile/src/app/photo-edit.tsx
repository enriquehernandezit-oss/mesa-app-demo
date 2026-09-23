import { Image } from 'expo-image'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button, Caption } from '@/components/ui'
import { CloseIcon, RotateIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { finishPhotoEdit, getPendingPhotoEdit } from '@/lib/photoEditor'
import { useColor } from '@/theme/useColor'

const FRAME_MARGIN = 40
const MAX_FRAME = 360
const MIN_SCALE = 1
const MAX_SCALE = 4

function clamp(v: number, lo: number, hi: number) {
  'worklet'
  return Math.min(Math.max(v, lo), hi)
}

// The crop rect, in the working image's own pixel space, that the current
// pan/zoom is showing inside the frame. `scale`/`translateX`/`translateY` are
// read once here (on confirm), not driven live — this only ever runs on the
// JS thread. Clamped defensively even though the live gesture already clamps
// as it goes, so a rounding slip can never hand ImageManipulator an
// out-of-bounds rect.
function cropRectFor(
  size: { width: number; height: number },
  baseScale: number,
  scale: number,
  translateX: number,
  translateY: number,
  frame: number,
) {
  const total = baseScale * scale
  const cropSize = frame / total
  const centerX = size.width / 2 - translateX / total
  const centerY = size.height / 2 - translateY / total
  const originX = Math.min(Math.max(centerX - cropSize / 2, 0), size.width - cropSize)
  const originY = Math.min(Math.max(centerY - cropSize / 2, 0), size.height - cropSize)
  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.round(cropSize),
    height: Math.round(cropSize),
  }
}

// Crop + rotate (M6) — a page sheet pushed by lib/photoEditor.ts's editPhoto(),
// shared by the avatar picker and every dish-photo call site (they all funnel
// through lib/dishPhoto.ts's pickDishPhoto). Square frame only: every current
// caller wants a square (avatar, dish photo), so that's all this builds —
// see the header comment there for why. Rotate is baked into a real file on
// each tap (via ImageManipulator, not a CSS-style preview transform) so the
// pan/zoom math below only ever has to reason about one upright image.
export default function PhotoEditScreen() {
  const router = useRouter()
  const t = useT()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const accent = useColor('accent')
  const [job] = useState(() => getPendingPhotoEdit())
  const resolvedRef = useRef(false)

  const [workingUri, setWorkingUri] = useState(job?.uri ?? '')
  const [workingSize, setWorkingSize] = useState<{ width: number; height: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)

  function finish(uri: string | null) {
    resolvedRef.current = true
    finishPhotoEdit(uri)
  }

  useEffect(() => {
    return () => {
      if (!resolvedRef.current) finishPhotoEdit(null)
    }
  }, [])

  // Normalizes the picked photo into a fresh JPEG and reads its real
  // dimensions from the decoder, once, on mount. expo-image-picker's own
  // width/height can come back 0 ("if the system did not provide" them per
  // its own types), so this — not the picker — is the number the crop math
  // below trusts.
  useEffect(() => {
    if (!job) {
      finish(null)
      router.back()
      return
    }
    let cancelled = false
    ImageManipulator.manipulate(job.uri)
      .renderAsync()
      .then((ref) => ref.saveAsync({ format: SaveFormat.JPEG, compress: 1 }))
      .then((saved) => {
        if (cancelled) return
        setWorkingUri(saved.uri)
        setWorkingSize({ width: saved.width, height: saved.height })
      })
      .catch((err) => {
        if (cancelled) return
        captureError(err, 'photoEdit.load')
        toast({ variant: 'error', message: t('photoEdit.error') })
        finish(null)
        router.back()
      })
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react/exhaustive-deps -- runs once on mount for the job frozen in state above
  }, [])

  const FRAME = Math.min(width - FRAME_MARGIN * 2, MAX_FRAME)
  const baseScale = workingSize
    ? Math.max(FRAME / workingSize.width, FRAME / workingSize.height)
    : 1
  const contentSize = workingSize
    ? { width: workingSize.width * baseScale, height: workingSize.height * baseScale }
    : { width: FRAME, height: FRAME }

  const pan = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })
    .onUpdate((e) => {
      if (!workingSize) return
      const total = baseScale * scale.value
      const maxX = Math.max(0, (workingSize.width * total - FRAME) / 2)
      const maxY = Math.max(0, (workingSize.height * total - FRAME) / 2)
      translateX.value = clamp(savedTranslateX.value + e.translationX, -maxX, maxX)
      translateY.value = clamp(savedTranslateY.value + e.translationY, -maxY, maxY)
    })
  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value
    })
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE)
    })
    .onEnd(() => {
      if (!workingSize) return
      const total = baseScale * scale.value
      const maxX = Math.max(0, (workingSize.width * total - FRAME) / 2)
      const maxY = Math.max(0, (workingSize.height * total - FRAME) / 2)
      translateX.value = clamp(translateX.value, -maxX, maxX)
      translateY.value = clamp(translateY.value, -maxY, maxY)
    })
  const composed = Gesture.Simultaneous(pan, pinch)

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  async function rotate() {
    if (busy || !workingSize) return
    setBusy(true)
    try {
      const ref = await ImageManipulator.manipulate(workingUri).rotate(90).renderAsync()
      const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 1 })
      setWorkingUri(saved.uri)
      setWorkingSize({ width: saved.width, height: saved.height })
      scale.value = 1
      savedScale.value = 1
      translateX.value = 0
      translateY.value = 0
      savedTranslateX.value = 0
      savedTranslateY.value = 0
    } catch (err) {
      captureError(err, 'photoEdit.rotate')
      toast({ variant: 'error', message: t('photoEdit.error') })
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (busy || !workingSize || !job) return
    setBusy(true)
    try {
      const rect = cropRectFor(
        workingSize,
        baseScale,
        scale.value,
        translateX.value,
        translateY.value,
        FRAME,
      )
      const ref = await ImageManipulator.manipulate(workingUri)
        .crop(rect)
        .resize({ width: job.maxEdge, height: job.maxEdge })
        .renderAsync()
      const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: job.quality })
      finish(saved.uri)
      router.back()
    } catch (err) {
      captureError(err, 'photoEdit.confirm')
      toast({ variant: 'error', message: t('photoEdit.error') })
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    finish(null)
    router.back()
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <View className="flex-row items-center justify-between px-5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('comments.close')}
          onPress={cancel}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-pill bg-bg-sunk active:opacity-70"
        >
          <CloseIcon size={18} />
        </Pressable>
        <Text className="font-ui-semibold text-label text-text">{t('photoEdit.title')}</Text>
        <View className="h-10 w-10" />
      </View>

      <View className="flex-1 items-center justify-center px-5">
        <View
          style={[
            { width: FRAME, height: FRAME },
            { borderRadius: job?.shape === 'circle' ? FRAME / 2 : 16 },
          ]}
          className="items-center justify-center overflow-hidden bg-bg-sunk"
        >
          {!workingSize ? (
            <ActivityIndicator color={accent} />
          ) : (
            <GestureDetector gesture={composed}>
              <Animated.View style={[contentSize, imageStyle]}>
                <Image
                  source={{ uri: workingUri }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              </Animated.View>
            </GestureDetector>
          )}
        </View>
        <Caption className="mt-4 text-center">{t('photoEdit.hint')}</Caption>
      </View>

      <View
        className="flex-row items-center gap-3 px-5"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('photoEdit.rotate')}
          disabled={busy || !workingSize}
          onPress={rotate}
          className="h-[52px] w-[52px] items-center justify-center rounded border border-line bg-surface active:opacity-70 disabled:opacity-45"
        >
          <RotateIcon size={20} />
        </Pressable>
        <Button className="flex-1" loading={busy} disabled={!workingSize} onPress={confirm}>
          {t('photoEdit.use_photo')}
        </Button>
      </View>
    </View>
  )
}
