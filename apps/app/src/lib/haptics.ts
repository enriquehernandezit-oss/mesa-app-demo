import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

// Capacitor's web implementation already falls back to navigator.vibrate()
// when available and is a silent no-op otherwise — these wrappers only add
// the try/catch, since haptics APIs can throw on a browser/permission that
// rejects them outright rather than degrading gracefully.
async function run(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch {
    // No haptic hardware/permission — the tap still worked, just silently.
  }
}

// A light tap — reactions (heart), toggles, the FAB.
export function tapLight() {
  return run(() => Haptics.impact({ style: ImpactStyle.Light }))
}

// A firmer confirmation — completing the rank flow.
export function tapSuccess() {
  return run(() => Haptics.notification({ type: NotificationType.Success }))
}
