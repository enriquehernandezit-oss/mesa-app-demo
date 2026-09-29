import type { ReactNode } from 'react'
import { View } from 'react-native'

import { Glass } from '@/components/ui/Glass'

// A small chip laid over a picture — the time on an event, "New" on a place, the pick's
// label. Over a PHOTO it is dark glass (a photo is its own dark island). Over a NAME CARD,
// which is pale by day, dark glass goes muddy grey-brown, so it is a crisp solid ink chip
// there instead. `textClass` is the color for the text inside, which follows the same
// split — see `photoChipText`.
export const photoChipText = (onPhoto: boolean) => (onPhoto ? 'text-on-photo' : 'text-on-ink')

export function PhotoChip({
  onPhoto,
  radius,
  className,
  children,
}: {
  onPhoto: boolean
  radius: number
  className: string
  children: ReactNode
}) {
  return onPhoto ? (
    <Glass solid variant="photo" radius={radius} className={className}>
      {children}
    </Glass>
  ) : (
    <View style={{ borderRadius: radius }} className={`bg-ink ${className}`}>
      {children}
    </View>
  )
}
