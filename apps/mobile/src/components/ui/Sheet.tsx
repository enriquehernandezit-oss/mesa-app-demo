import { Eyebrow } from '@/components/ui'
import { CheckIcon } from '@/components/ui/icons'
import { getLanguage, t } from '@/lib/i18n'
import { BRASS_SHADOW } from '@/theme/vars'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

// Mesa's own themed chooser (a centered pop-up since Sept 2026; was a bottom sheet) — the same imperative-promise shape as
// lib/actionSheet.ts's showActionSheet, so a call site swaps by changing one
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
// Rendering: a full-screen scrim Pressable dismisses on tap; the card claims
// the touch responder itself (onStartShouldSetResponder) so a tap inside it
// doesn't bubble up and close it. Tap-scrim plus a Cancel row. The options list itself DOES scroll
// (capped at 60% of the window height, title/Cancel stay fixed outside it) —
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

// Centered, not a bottom sheet (founder's call, Sept 2026): a chooser pops up
// in the middle of the screen — a white card over the scrim, easing in from
// 94% scale — and eases back out the same way. The animation is driven by one
// shared value rather than Reanimated's entering/exiting: an `exiting` view
// stays alive in the native tree for the whole fade and kept catching taps
// meant for the screen behind it. Here the root flips to pointerEvents="none"
// the instant a choice is made, so the fade-out is purely visual.
const EASE = Easing.out(Easing.cubic)

export function SheetHost() {
  const req = useSheetRequest()
  const { height: windowHeight } = useWindowDimensions()
  // The last request, kept on screen through the fade-out after `req` clears.
  const [shown, setShown] = useState<SheetRequest | null>(null)
  const progress = useSharedValue(0)

  useEffect(() => {
    if (req) {
      setShown(req)
      progress.value = withTiming(1, { duration: 200, easing: EASE })
    } else {
      progress.value = withTiming(0, { duration: 150, easing: EASE }, (finished) => {
        if (finished) runOnJS(setShown)(null)
      })
    }
  }, [req, progress])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.94 + progress.value * 0.06 }, { translateY: (1 - progress.value) * 8 }],
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
      className="absolute inset-0 items-center justify-center px-8"
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
        className="w-full overflow-hidden rounded-card border border-line bg-surface-raised"
        style={[
          {
            maxWidth: 380,
            shadowColor: BRASS_SHADOW,
            shadowOpacity: 0.25,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
          },
          cardStyle,
        ]}
      >
        {shown.title ? (
          <View className="border-line border-b px-5 pt-4 pb-3">
            <Eyebrow>{shown.title}</Eyebrow>
            {shown.message ? (
              <Text className="mt-1 font-ui text-label text-text-muted">{shown.message}</Text>
            ) : null}
          </View>
        ) : (
          <View className="pt-2" />
        )}
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
                className="min-h-[50px] flex-row items-center gap-3 px-5 active:bg-bg-sunk"
              >
                <Text
                  className={`flex-1 font-ui text-body ${
                    o.destructive ? 'text-status-packed' : active ? 'text-accent' : 'text-text'
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
        <View className="border-line border-t">
          <Pressable
            accessibilityRole="button"
            onPress={() => resolveCurrent(null)}
            className="min-h-[50px] items-center justify-center px-5 active:bg-bg-sunk"
          >
            <Text className="font-ui-medium text-body text-text-muted">{shown.cancelLabel}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  )
}
