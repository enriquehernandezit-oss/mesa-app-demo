import { View } from 'react-native'

import { CheckIcon } from '@/components/ui/icons'

// A 26pt circle: a solid ink check when picked, an empty ring when not. The pick mark of a spot in
// a new table, a vote already cast, a list a place is saved to.
export function CheckCircle({ on }: { on: boolean }) {
  return on ? (
    <View className="h-[26px] w-[26px] items-center justify-center rounded-pill bg-ink">
      <CheckIcon size={15} color="on-ink" strokeWidth={2.4} />
    </View>
  ) : (
    <View className="h-[26px] w-[26px] rounded-pill border-[1.5px] border-text-faint" />
  )
}
