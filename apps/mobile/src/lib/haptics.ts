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

// A light tap — reactions (the heart), toggles, the FAB.
export function tapLight() {
  return run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
}

// A firmer confirmation — completing the rank flow.
export function tapSuccess() {
  return run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
}
