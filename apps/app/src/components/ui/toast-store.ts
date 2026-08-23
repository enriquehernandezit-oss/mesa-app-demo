// A module-level toast store — no provider, no context. `toast()` can be
// called from anywhere (a mutation's onError, a plain lib module like
// lib/rankingRemoval.ts); one <Toaster/> (Toast.tsx) renders whatever is live.
// Sonner-style DX, hand-rolled on useSyncExternalStore — no new dependency.
import { useSyncExternalStore } from 'react'

export type ToastAction = { label: string; onClick: () => void }
export type ToastInput = {
  message: string
  variant?: 'default' | 'error'
  duration?: number // ms; default 4000
  action?: ToastAction
  // Fires ONLY when the timer elapses on its own — never on action click,
  // manual dismiss, or swipe. This is what lets a caller distinguish "the undo
  // window expired, commit now" from "the user undid it".
  onAutoClose?: () => void
}
export type Toast = ToastInput & { id: number; dismissing?: boolean }

const DEFAULT_DURATION = 4000
const EXIT_MS = 200 // must match toast.css's [data-dismissing] transition-duration

let toasts: Toast[] = []
const listeners = new Set<() => void>()

type TimerEntry = { remaining: number; startedAt: number; handle: number; onElapse: () => void }
const timers = new Map<number, TimerEntry>()
let nextId = 1

function emit() {
  toasts = [...toasts]
  for (const l of listeners) l()
}

function clearTimer(id: number) {
  const t = timers.get(id)
  if (t) {
    window.clearTimeout(t.handle)
    timers.delete(id)
  }
}

function scheduleTimer(id: number, ms: number, onElapse: () => void) {
  const handle = window.setTimeout(() => {
    timers.delete(id)
    onElapse()
  }, ms)
  timers.set(id, { remaining: ms, startedAt: Date.now(), handle, onElapse })
}

// Pause every live timer while the tab is hidden, resume with the remaining
// time on return — so an undo window can't silently expire while backgrounded.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      for (const t of timers.values()) {
        window.clearTimeout(t.handle)
        t.remaining -= Date.now() - t.startedAt
      }
    } else {
      for (const [id, t] of timers) {
        const ms = Math.max(0, t.remaining)
        t.startedAt = Date.now()
        t.handle = window.setTimeout(() => {
          timers.delete(id)
          t.onElapse()
        }, ms)
      }
    }
  })
}

function removeToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

// Begins the exit transition, then removes the entry after EXIT_MS. A fixed
// timeout (not `transitionend`) — transitionend is unreliable once
// prefers-reduced-motion collapses the duration to ~0.
function beginExit(id: number) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, dismissing: true } : t))
  emit()
  window.setTimeout(() => removeToast(id), EXIT_MS)
}

export function toast(input: ToastInput): number {
  const id = nextId++
  toasts = [...toasts, { ...input, id }]
  emit()
  const duration = input.duration ?? DEFAULT_DURATION
  if (duration > 0) {
    scheduleTimer(id, duration, () => {
      input.onAutoClose?.()
      beginExit(id)
    })
  }
  return id
}

// Manual/programmatic dismiss (action click, swipe) — never fires onAutoClose.
export function dismiss(id: number): void {
  clearTimer(id)
  beginExit(id)
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
