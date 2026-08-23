import { toast } from '../components/ui/toast-store'

// Several controls are inert-by-design: Reserve, Order, booking slots, join-a-
// table, in-app messages — they render live (Mesa shouldn't look like it's
// missing them) but have no supply/backend behind them yet. Tapping one used to
// do nothing, silently. This gives that tap a voice: a short toast that explains
// the control is coming, so a tap never reads as a dead button. One place to
// tune the copy's tone/duration for every such control.
export function comingSoon(message: string) {
  toast({ message })
}
