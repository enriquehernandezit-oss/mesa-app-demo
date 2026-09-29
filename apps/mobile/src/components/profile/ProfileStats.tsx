import { View } from 'react-native'

import { Stat } from '@/components/ui/patterns'
import { useLift } from '@/theme/useLift'

// The row of counts under a person's name — Ranked · Followers · Following · Week streak on your
// own profile, Followers · Following · Ranked on someone else's: one white r22 card, the numbers in
// the serif, hairlines between. Each count that has somewhere to go is a control. `n` is a string
// so a count still loading can be an em dash and the card still holds its space.
export function ProfileStats({ items }: { items: { n: string; l: string; go?: () => void }[] }) {
  const lift = useLift()
  return (
    <View className="mx-4 flex-row rounded-group bg-surface py-2" style={lift}>
      {items.map((s, i) => (
        <View key={s.l} className={`flex-1 ${i > 0 ? 'border-line border-l' : ''}`}>
          <Stat n={s.n} l={s.l} onPress={s.go} />
        </View>
      ))}
    </View>
  )
}
