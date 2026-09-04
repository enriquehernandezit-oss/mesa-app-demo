import { track } from '@/lib/analytics'
import { useSyncExternalStore } from 'react'

// The viral loop's imperative bridge — same external-store shape as toast-store.
// A screen calls shareSpotCard(...) / shareListCard(...); the single
// <ShareCardHost/> (mounted in _layout) renders the off-screen card, captures it
// to a PNG with react-native-view-shot, and hands it to the native share sheet.
// This replaces the web's canvas renderSpotCard/renderListCard in lib/shareCard.ts.
export type ShareListItem = { position: number; name: string; score: number }

export type SpotCardReq = {
  kind: 'spot'
  text: string
  name: string
  meta: string
  position?: number | null
  score?: number | null
  note?: string | null
  coverUrl?: string | null
}
export type ListCardReq = {
  kind: 'list'
  text: string
  eyebrow: string
  subtitle: string
  items: ShareListItem[]
  coverUrl?: string | null
}
export type ShareCardReq = (SpotCardReq | ListCardReq) & { resolve: () => void }

let current: ShareCardReq | null = null
const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}

function open(req: SpotCardReq | ListCardReq): Promise<void> {
  track('share_card_created', { kind: req.kind })
  // Coalesce: a second request while one is live replaces it (the host captures
  // whatever is current). Callers await one share at a time in practice.
  return new Promise<void>((resolve) => {
    current = { ...req, resolve }
    emit()
  })
}

export const shareSpotCard = (r: Omit<SpotCardReq, 'kind'>) => open({ ...r, kind: 'spot' })
export const shareListCard = (r: Omit<ListCardReq, 'kind'>) => open({ ...r, kind: 'list' })

export function finishShareCard(): void {
  current?.resolve()
  current = null
  emit()
}

export function useShareCardRequest(): ShareCardReq | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
