import { Eyebrow } from '@/components/ui'
import { CheckIcon } from '@/components/ui/icons'
import { BRASS_SHADOW } from '@/theme/vars'
import { useSyncExternalStore } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Mesa's own themed bottom sheet — the same imperative-promise shape as
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
// Rendering follows the app's own existing overlay, RankCoachmark
// (app/rank.tsx): a full-screen scrim Pressable dismisses on tap; the panel
// claims the touch responder itself (onStartShouldSetResponder) so a tap
// inside it doesn't bubble up and close the sheet. No drag-to-dismiss in v1 —
// tap-scrim plus a Cancel row is enough, and this is 2-8 fixed rows, not a
// scrollable/snapping surface that would need one.

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
      cancelLabel: opts.cancelLabel ?? 'Cancelar',
      selectedIndex: opts.selectedIndex,
      resolve,
    }
    emit()
  })
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export function SheetHost() {
  const req = useSheetRequest()
  const insets = useSafeAreaInsets()
  if (!req) return null
  const showCheckSlot = req.selectedIndex != null
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
    // non-modal screen, which covers the other three call sites.
    <AnimatedPressable
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(150)}
      accessibilityViewIsModal
      onPress={() => resolveCurrent(null)}
      className="absolute inset-0 justify-end bg-overlay-scrim"
    >
      <Animated.View
        entering={FadeInDown.springify().damping(16)}
        onStartShouldSetResponder={() => true}
        className="w-full rounded-t border-t border-line bg-surface-raised"
        style={{
          paddingBottom: insets.bottom + 12,
          shadowColor: BRASS_SHADOW,
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
        }}
      >
        {req.title ? (
          <View className="border-line border-b px-5 pt-4 pb-3">
            <Eyebrow>{req.title}</Eyebrow>
            {req.message ? (
              <Text className="mt-1 font-ui text-label text-text-muted">{req.message}</Text>
            ) : null}
          </View>
        ) : (
          <View className="pt-2" />
        )}
        {req.options.map((o, i) => {
          const active = i === req.selectedIndex
          return (
            <Pressable
              key={o.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => resolveCurrent(i)}
              className="min-h-[52px] flex-row items-center gap-3 px-5 active:opacity-70"
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
        <View className="mt-1 border-line border-t">
          <Pressable
            accessibilityRole="button"
            onPress={() => resolveCurrent(null)}
            className="min-h-[52px] items-center justify-center px-5 active:opacity-70"
          >
            <Text className="font-ui-medium text-body text-text-muted">{req.cancelLabel}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </AnimatedPressable>
  )
}
