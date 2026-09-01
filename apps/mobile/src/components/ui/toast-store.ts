import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'

// Module-level toast store, ported from apps/app/src/components/ui/toast-store.ts.
// `toast()` can be called from anywhere (a mutation's onError, a plain lib);
// one <Toaster/> renders whatever is live. The web version drove its own CSS
// exit transition; here reanimated owns enter/exit, so the store just adds and
// removes — but the timer semantics (including onAutoClose for undo windows and
// pause-while-backgrounded) are preserved.
export type ToastAction = { label: string; onClick: () => void }
export type ToastInput = {
  message: string
  variant?: 'default' | 'error'
  duration?: number
  action?: ToastAction
  // Fires ONLY when the timer elapses on its own — never on action/dismiss.
  // Lets a caller tell "the undo window expired, commit" from "the user undid it".
  onAutoClose?: () => void
}
export type Toast = ToastInput & { id: number }

const DEFAULT_DURATION = 4000

let toasts: Toast[] = []
const listeners = new Set<() => void>()

type TimerEntry = {
  remaining: number
  startedAt: number
  handle: ReturnType<typeof setTimeout>
  onElapse: () => void
}
const timers = new Map<number, TimerEntry>()
let nextId = 1

function emit() {
  toasts = [...toasts]
  for (const l of listeners) l()
}

function clearTimer(id: number) {
  const t = timers.get(id)
  if (t) {
    clearTimeout(t.handle)
    timers.delete(id)
  }
}

function scheduleTimer(id: number, ms: number, onElapse: () => void) {
  const handle = setTimeout(() => {
    timers.delete(id)
    onElapse()
  }, ms)
  timers.set(id, { remaining: ms, startedAt: Date.now(), handle, onElapse })
}

// Pause every live timer while the app is backgrounded, resume with the time
// remaining on return — so an undo window can't silently expire off-screen.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') {
    for (const t of timers.values()) {
      clearTimeout(t.handle)
      t.remaining -= Date.now() - t.startedAt
    }
  } else {
    for (const [id, t] of timers) {
      const ms = Math.max(0, t.remaining)
      t.startedAt = Date.now()
      t.handle = setTimeout(() => {
        timers.delete(id)
        t.onElapse()
      }, ms)
    }
  }
})

function removeToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toast(input: ToastInput): number {
  const id = nextId++
  toasts = [...toasts, { ...input, id }]
  emit()
  const duration = input.duration ?? DEFAULT_DURATION
  if (duration > 0) {
    scheduleTimer(id, duration, () => {
      input.onAutoClose?.()
      removeToast(id)
    })
  }
  return id
}

// Manual/programmatic dismiss (action click) — never fires onAutoClose.
export function dismiss(id: number): void {
  clearTimer(id)
  removeToast(id)
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => toasts,
  )
}
