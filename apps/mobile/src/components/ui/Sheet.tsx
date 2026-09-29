import { useEffect, useState, useSyncExternalStore } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import { getLanguage, t } from '@/lib/i18n'
import { useLift } from '@/theme/useLift'
import { SHADOW } from '@/theme/vars'

// Mesa's own themed chooser — a bottom sheet (r34, grabber, a close chip, 50pt rows;
// Redesign 2 replaced the centered pop-up the app briefly had) — the same
// imperative-promise shape as lib/actionSheet.ts's showActionSheet, so a call site swaps by changing one
// import (and, where useful, adding selectedIndex). Reserved for the app's
// genuine CHOOSERS (sort, maps app, report reason); the three single-
// destructive CONFIRMS (delete dish, block user, remove report) stay on the
// native system sheet on purpose — system red-on-grey is the vocabulary
// people read as "this is irreversible," and skinning it in Mesa's paper
// would make it read as LESS serious, not more on-brand.
//
// NOT used for the camera-vs-library chooser in lib/dishPhoto.ts — its two
// callers (the dish composer, the rank flow's photo step) are both presented
// with `presentation: 'modal'`, and this component (a root-mounted overlay)
// cannot render above an already-presented native modal; see the note inside
// SheetHost below for what was tried and why it stays native there. The
// avatar picker's camera-vs-library chooser ((tabs)/profile.tsx) DOES use
// this component — Profile is a plain tab screen, not a modal, so the
// nesting problem doesn't apply there.
//
// Architecture mirrors toast-store.ts/Toast.tsx: a module-level store holds
// at most one live request; <SheetHost/> (mounted once, root layout) renders
// it. That imperative-promise shape is what lets a call site just `await
// showSheet(...)` from anywhere — a plain lib file, a mutation's callback —
// with no provider and no context.
//
// Rendering: a full-screen scrim Pressable dismisses on tap; the sheet claims
// the touch responder itself (onStartShouldSetResponder) so a tap inside it
// doesn't bubble up and close it. Dismiss = tap the scrim, the close chip, or drag
// the grabber/title down. The options list itself DOES scroll
// (capped at 55% of the window height, the header stays fixed above it) —
// a sort menu is 2-4 fixed rows, but a filter dimension like cuisine or
// sector can run well past that on the real catalog (M14).

export type SheetOption = { label: string; destructive?: boolean }

type SheetRequest = {
  title?: string
  message?: string
  options: SheetOption[]
  cancelLabel: string
  selectedIndex?: number
  resolve: (index: number | null) => void
}

let current: SheetRequest | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

// Resolves to the chosen index, or null on scrim-tap/cancel — identical
// contract to showActionSheet, so callers don't change shape when they
// switch. `selectedIndex` draws a checkmark on the current option — the
// native sheet this replaces has no way to show that at all, which was a
// real usability gap (which sort is active?).
export function showSheet(opts: {
  title?: string
  message?: string
  options: SheetOption[]
  cancelLabel?: string
  selectedIndex?: number
}): Promise<number | null> {
  return new Promise((resolve) => {
    // Only one sheet at a time. A second call while one is live resolves the
    // first as cancelled rather than stacking sheets.
    current?.resolve(null)
    current = {
      title: opts.title,
      message: opts.message,
      options: opts.options,
      cancelLabel: opts.cancelLabel ?? t(getLanguage(), 'common.cancel'),
      selectedIndex: opts.selectedIndex,
      resolve,
    }
    emit()
  })
}

// A single-select "dropdown pill" chooser built on showSheet (M14): shared
// by every filter-dimension pill across the app (Explore, Rankings) so they
// can't drift on this shape — "Cualquiera" always first, then `values` with
// a checkmark on the current one. Resolves to `undefined` (not `null`) when
// the sheet is dismissed without a pick, so a caller can tell "cancelled"
// apart from "explicitly chose Cualquiera" (which resolves to `null`).
export async function pickOne<V>(
  title: string,
  values: V[],
  selected: V | null,
  render: (v: V) => string,
): Promise<V | null | undefined> {
  const idx = await showSheet({
    title,
    options: [
      { label: t(getLanguage(), 'common.any') },
      ...values.map((v) => ({ label: render(v) })),
    ],
    selectedIndex: selected == null ? 0 : 1 + values.findIndex((v) => v === selected),
  })
  if (idx == null) return undefined
  return idx === 0 ? null : (values[idx - 1] ?? null)
}

function resolveCurrent(index: number | null) {
  if (!current) return
  const req = current
  current = null
  emit()
  req.resolve(index)
}

function useSheetRequest(): SheetRequest | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => current,
  )
}

// The sheet rises from the bottom edge over a dimming scrim and eases back down. The
// animation is driven by one shared value rather than Reanimated's entering/exiting:
// an `exiting` view stays alive in the native tree for the whole fade and kept
// catching taps meant for the screen behind it. Here the root flips to
// pointerEvents="none" the instant a choice is made, so the fade-out is purely visual.
const EASE = Easing.out(Easing.cubic)

export function SheetHost() {
  const req = useSheetRequest()
  const { height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const lift = useLift()
  // The last request, kept on screen through the fade-out after `req` clears.
  const [shown, setShown] = useState<SheetRequest | null>(null)
  const progress = useSharedValue(0)
  // How far the member has dragged the sheet down, and how tall it is — the slide
  // in/out travels the sheet's own height, so it never overshoots or lags.
  const drag = useSharedValue(0)
  const sheetH = useSharedValue(windowHeight)

  useEffect(() => {
    if (req) {
      drag.value = 0
      setShown(req)
      progress.value = withTiming(1, { duration: 260, easing: EASE })
    } else {
      progress.value = withTiming(0, { duration: 200, easing: EASE }, (finished) => {
        if (finished) runOnJS(setShown)(null)
      })
    }
  }, [req, progress, drag])

  // Drag the header down to dismiss: past a third of a second's flick or ~90pt.
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationY)
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 900) {
        runOnJS(resolveCurrent)(null)
      } else {
        drag.value = withSpring(0, { damping: 26, stiffness: 320, mass: 0.6 })
      }
    })

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * sheetH.value + drag.value }],
  }))

  if (!shown) return null
  const showCheckSlot = shown.selectedIndex != null
  return (
    // A plain root-mounted overlay, same shape as <Toaster/> — NOT wrapped in
    // RN's own <Modal>. Tried that first: it does not help. `rank` and
    // `dish/index` are themselves presented with `presentation: 'modal'` (a
    // real native UIViewController layer), and on-device testing showed RN's
    // <Modal> silently fails to present a SECOND modal on top of one that's
    // already presented — no error, no warning, it just never appears. That
    // is exactly why `lib/dishPhoto.ts`'s camera/library chooser — the one
    // call site whose only two callers (the dish composer, the rank flow's
    // photo step) are BOTH modals — stays on the native showActionSheet
    // instead of this Sheet. This component works correctly from any
    // non-modal screen, which covers the other call sites.
    <View
      pointerEvents={req ? 'auto' : 'none'}
      accessibilityViewIsModal
      className="absolute inset-0 justify-end"
    >
      <Animated.View style={scrimStyle} className="absolute inset-0 bg-overlay-scrim">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown.cancelLabel}
          onPress={() => resolveCurrent(null)}
          className="flex-1"
        />
      </Animated.View>
      <Animated.View
        onStartShouldSetResponder={() => true}
        onLayout={(e) => {
          sheetH.value = e.nativeEvent.layout.height
        }}
        className="rounded-t-sheet bg-bg"
        style={[
          {
            paddingBottom: insets.bottom + 12,
            shadowColor: SHADOW,
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -8 },
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={pan}>
          <View>
            <View className="items-center pb-2.5 pt-2">
              <View className="h-[5px] w-[38px] rounded-pill bg-text-faint opacity-80" />
            </View>
            {shown.title ? (
              <View className="flex-row items-center justify-between px-[18px] pb-2.5">
                <View className="h-[34px] w-[34px]" />
                <Text
                  numberOfLines={1}
                  className="flex-1 px-2 text-center font-ui-semibold text-body text-text"
                >
                  {shown.title}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={shown.cancelLabel}
                  onPress={() => resolveCurrent(null)}
                  className="h-[34px] w-[34px] items-center justify-center rounded-pill bg-chip active:opacity-70"
                  style={lift}
                >
                  <CloseIcon size={16} />
                </Pressable>
              </View>
            ) : null}
            {shown.message ? (
              <Text className="px-6 pb-2.5 text-center font-ui text-label text-text-muted">
                {shown.message}
              </Text>
            ) : null}
          </View>
        </GestureDetector>
        {/* The options: one white group, 50pt rows, hairlines between. The list
            scrolls when it is long (cuisine, sector) with the header held above it. */}
        <View className="mx-4 overflow-hidden rounded-group bg-surface" style={lift}>
          <ScrollView
            style={{ maxHeight: windowHeight * 0.55 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {shown.options.map((o, i) => {
              const active = i === shown.selectedIndex
              return (
                <Pressable
                  key={`${i}:${o.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => resolveCurrent(i)}
                  className={`min-h-[50px] flex-row items-center gap-3 px-4 active:bg-bg-sunk ${
                    i > 0 ? 'border-line border-t' : ''
                  }`}
                >
                  <Text
                    className={`flex-1 text-body ${active ? 'font-ui-semibold' : 'font-ui'} ${
                      o.destructive ? 'text-danger' : active ? 'text-accent' : 'text-text'
                    }`}
                  >
                    {o.label}
                  </Text>
                  {showCheckSlot ? (
                    active ? (
                      <CheckIcon size={16} color="accent" />
                    ) : (
                      <View style={{ width: 16 }} />
                    )
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  )
}
