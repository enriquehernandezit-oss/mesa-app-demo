import { useT } from '@/lib/i18n'
import { type LocationWords, locationLabel, useLocationFilter } from '@/lib/locationFilter'

// The city filter's words, in the member's language.
export function useLocationWords(): LocationWords {
  const t = useT()
  return {
    home: t('location.home'),
    sd: t('location.sd'),
  }
}

// "Santo Domingo, RD", "Santo Domingo · Miami", "Miami"…
export function useLocationLabel(): string {
  const words = useLocationWords()
  return locationLabel(useLocationFilter(), words)
}
