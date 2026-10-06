import { useMemo } from 'react'

import type { OpenWords } from './hours'
import { dateLocale, useLanguage, useT } from './i18n'

// The words openStatusLine (lib/hours.ts) speaks in the member's language. A weekday is named through
// Intl from a known Sunday (4 Jan 2026), so no day names live in the dictionaries.
export function useOpenWords(): OpenWords {
  const t = useT()
  const lang = useLanguage()
  return useMemo(() => {
    const weekday = new Intl.DateTimeFormat(dateLocale(lang), { weekday: 'long', timeZone: 'UTC' })
    const dayName = (d: number) => weekday.format(new Date(Date.UTC(2026, 0, 4 + d)))
    return {
      openUntil: (time) => t('place.open_closes', { time }),
      open24h: t('place.open_24h'),
      opensToday: (time) => t('place.closed_opens', { time }),
      opensTomorrow: (time) => t('place.closed_opens_tomorrow', { time }),
      opensOn: (day, time) => t('place.closed_opens_day', { day: dayName(day), time }),
      closed: t('place.closed_now'),
    }
  }, [t, lang])
}
