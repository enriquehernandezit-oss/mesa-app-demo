import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native'

import { MentionSuggestions } from '@/components/MentionSuggestions'
import { api } from '@/lib/api'
import { activeMention, insertMention } from '@/lib/mentionToken'
import type { MentionCandidate } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'

// @-tagging for a text field, the way Instagram's comment box does it: type "@" and the start of a name or
// @handle, a list of people appears under (or over) the field, tap one and it becomes "@handle ", or just
// keep typing the whole handle. The field stays an ordinary controlled TextInput/Field: spread `inputProps`
// onto it and render `suggestions` where the list should sit.
//
//   const mention = useMentionField({ value, onChange: setValue, maxLength: 280 })
//   <Field {...mention.inputProps} … />
//   {mention.suggestions}
//
// The server decides who is offered (people you follow and who follow you by name, anyone by handle; never
// a block or a ban) — GET /social/mention-search.
export function useMentionField({
  value,
  onChange,
  maxLength,
}: {
  value: string
  onChange: (next: string) => void
  maxLength?: number
}): {
  inputProps: {
    value: string
    onChangeText: (next: string) => void
    onSelectionChange: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void
  }
  suggestions: ReactNode
} {
  const [cursor, setCursor] = useState(value.length)
  const token = value.includes('@') ? activeMention(value, cursor) : null
  const typed = useDebounced(token?.query ?? '', 120)
  const found = useQuery({
    queryKey: ['mention-search', typed],
    queryFn: () =>
      api.get<{ users: MentionCandidate[] }>(
        `/social/mention-search?q=${encodeURIComponent(typed)}`,
      ),
    enabled: token !== null,
    staleTime: 60_000,
    // The old list stays up while the next letter's answer is on its way, so it doesn't flicker.
    placeholderData: keepPreviousData,
  })

  const pick = (handle: string) => {
    if (!token) return
    const next = insertMention(value, token, handle)
    if (maxLength !== undefined && next.text.length > maxLength) return
    onChange(next.text)
    setCursor(next.cursor)
  }

  return {
    inputProps: {
      value,
      onChangeText: onChange,
      onSelectionChange: (e) => setCursor(e.nativeEvent.selection.end),
    },
    suggestions:
      token && (found.data?.users.length ?? 0) > 0 ? (
        <MentionSuggestions people={found.data?.users ?? []} onPick={pick} />
      ) : null,
  }
}
