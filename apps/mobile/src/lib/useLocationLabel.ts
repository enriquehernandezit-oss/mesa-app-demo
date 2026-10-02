import { useT } from '@/lib/i18n'
import { type LocationWords, locationLabel, useLocationFilter } from '@/lib/locationFilter'

// The location filter's words, in the member's language.
export function useLocationWords(): LocationWords {
  const t = useT()
  return {
    home: t('location.home'),
    sd: t('location.sd'),
    do: t('location.do'),
    world: t('location.world'),
  }
}

// "Santo Domingo, RD", "Santo Domingo · Miami", "Todo el mundo"…
export function useLocationLabel(): string {
  const words = useLocationWords()
  return locationLabel(useLocationFilter(), words)
}
