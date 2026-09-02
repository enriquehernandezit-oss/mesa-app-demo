import * as Haptics from 'expo-haptics'

// Thin wrappers over expo-haptics, ported from apps/app/src/lib/haptics.ts
// (which wrapped @capacitor/haptics). The try/catch is kept: haptics can reject
// on a device/simulator without the hardware, and a missing buzz must never
// break the tap that triggered it.
async function run(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch {
    // No haptic hardware — the tap still worked, just silently.
  }
}

// The whole taxonomy lives here so feedback stays consistent instead of being
// decided per screen:
//   tapLight   — a light tap: the heart, the FAB, save/want-to-try toggles.
//   tapSelect  — a selection tick: moving between tabs. Deliberately NOT used for
//                filter chips; a rail of chips buzzing on every tap is noise.
//   tapSuccess — a firmer confirmation: the ranking stamp, a dish posted.
//   tapError   — a failure. Fired centrally by the Toaster for every error toast,
//                so no individual mutation has to remember it.
export function tapLight() {
  return run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
}

export function tapSelect() {
  return run(() => Haptics.selectionAsync())
}

export function tapSuccess() {
  return run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
}

export function tapError() {
  return run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error))
}
