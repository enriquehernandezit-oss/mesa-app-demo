import type { ComponentProps } from 'react'
import { View } from 'react-native'

import { Field } from '@/components/ui/Field'
import { useMentionField } from '@/hooks/useMentionField'

// A Field that tags people: type "@" and a name or @handle and the people you might mean appear under it
// (hooks/useMentionField has the whole story). For a note, a caption — anywhere a person writes something
// another person might be named in.
type FieldProps = ComponentProps<typeof Field>

export function MentionField({
  value,
  onValue,
  maxLength,
  ...field
}: Omit<FieldProps, 'value' | 'onChangeText'> & {
  value: string
  // Called with the new text — typed, or completed from a tapped suggestion.
  onValue: (next: string) => void
}) {
  const mention = useMentionField({ value, onChange: onValue, maxLength })
  return (
    <View className="gap-2">
      <Field {...field} {...mention.inputProps} maxLength={maxLength} />
      {mention.suggestions}
    </View>
  )
}
