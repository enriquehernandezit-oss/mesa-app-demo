import { Wordmark } from '@/components/ui'
import { View } from 'react-native'

// Minimal centered wordmark shown while session/profile resolve.
export function Splash() {
  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <Wordmark size={56} />
    </View>
  )
}
