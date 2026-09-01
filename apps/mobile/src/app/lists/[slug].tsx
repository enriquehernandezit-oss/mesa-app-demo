import { ScreenHeader } from '@/components/ScreenHeader'
import { Body } from '@/components/ui'
import { useRouter } from 'expo-router'
import { View } from 'react-native'

// N5 stub — curated lists land with Discovery. Kept as a real route now so the
// list pills on a place resolve instead of dead-ending.
export default function ListScreen() {
  const router = useRouter()
  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={() => router.back()} backLabel="Atrás" />
      <View className="flex-1 items-center justify-center px-5">
        <Body className="text-center">Lista — próximamente.</Body>
      </View>
    </View>
  )
}
