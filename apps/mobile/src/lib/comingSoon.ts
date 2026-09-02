import { toast } from '@/components/ui/toast-store'

// A few controls are inert-by-design: they render live (Mesa shouldn't look like
// it's missing them) but have no backend behind them yet. This gives that tap a
// voice so it never reads as a dead button. Ported verbatim in spirit from
// apps/app/src/lib/comingSoon.ts.
export function comingSoon(message: string) {
  toast({ message })
}
