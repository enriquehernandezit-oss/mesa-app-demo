import { schema } from '@mesa/db'
import { sql } from 'drizzle-orm'

import { sdMinuteOfWeek } from './openingHours'

// "Open right now" in SQL: the place's weekly minutes (restaurants.open_minutes, written by
// lib/openingHours.ts) contain this minute of Santo Domingo's week. A place with no hours is not open
// as far as Mesa knows — the filter shows places that are certainly open, never a guess.
const { restaurants } = schema

export const isOpenNow = (now: Date = new Date()) =>
  sql`coalesce(${restaurants.openMinutes} @> ${sdMinuteOfWeek(now)}::int, false)`

// The same, as a column: true / false, or null when Mesa has no hours for the place.
export const openNowColumn = (now: Date = new Date()) =>
  sql<boolean | null>`(${restaurants.openMinutes} @> ${sdMinuteOfWeek(now)}::int)`
