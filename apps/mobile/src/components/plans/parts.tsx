import { Text, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { CheckIcon } from '@/components/ui/icons'

// The two small marks Plans repeats: a status badge (the plan's state in a list, a guest's reply
// or vote in a group) and the round pick mark (a spot to choose, a vote already cast).

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

// A 26pt circle: a solid ink check when picked, an empty ring when not.
export function CheckCircle({ on }: { on: boolean }) {
  return on ? (
    <View className="h-[26px] w-[26px] items-center justify-center rounded-pill bg-ink">
      <CheckIcon size={15} color="on-ink" strokeWidth={2.4} />
    </View>
  ) : (
    <View className="h-[26px] w-[26px] rounded-pill border-[1.5px] border-text-faint" />
  )
}
