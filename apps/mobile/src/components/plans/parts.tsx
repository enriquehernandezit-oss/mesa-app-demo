import { Text, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'

// The small mark Plans repeats: a status badge (the plan's state in a list, a guest's reply or vote
// in a group).

// `strong` is the one that asks something of you — a pending invite — solid ink; the rest are a
// quiet accent wash.
export function StatusBadge({ children, strong }: { children: string; strong?: boolean }) {
  return (
    <View
      className={`h-[24px] justify-center rounded-[12px] px-2.5 ${strong ? 'bg-ink' : 'bg-accent-soft'}`}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className={`font-ui-semibold text-eyebrow ${strong ? 'text-on-ink' : 'text-text'}`}
      >
        {children}
      </Text>
    </View>
  )
}
