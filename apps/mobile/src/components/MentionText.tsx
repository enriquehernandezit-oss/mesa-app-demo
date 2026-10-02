import { useRouter } from 'expo-router'
import { Fragment } from 'react'
import { Text } from 'react-native'

import { splitMentions } from '@/lib/mentionToken'

// The text of a note, comment or caption with its @handles tappable (they open that member's profile).
// Drop-in for the plain string inside an existing <Text>: it returns the pieces, so the surrounding Text
// keeps its size, colour, number of lines and quotes.
//
//   <Text className="…">“<MentionText text={note} />”</Text>
export function MentionText({ text }: { text: string }) {
  const router = useRouter()
  if (!text.includes('@')) return <>{text}</>
  return (
    <>
      {splitMentions(text).map((part, i) =>
        'handle' in part ? (
          <Text
            key={i}
            accessibilityRole="link"
            className="font-ui-semibold text-accent"
            suppressHighlighting
            onPress={() => router.push(`/u/handle/${part.handle}`)}
          >
            {part.raw}
          </Text>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}
