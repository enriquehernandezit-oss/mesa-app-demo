import { ScreenHeader } from '@/components/ScreenHeader'
import { Body } from '@/components/ui'
import { useRouter } from 'expo-router'
import { View } from 'react-native'

// N4 stub — the dish-detail screen (a dish + its linked ranking/place) is ported
// next in this milestone. Kept as a real route so RestaurantProfile's dish rail
// links resolve.
export default function DishDetailScreen() {
  const router = useRouter()
  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={() => router.back()} backLabel="Atrás" />
      <View className="flex-1 items-center justify-center px-5">
        <Body className="text-center">Pantalla del plato — próximamente.</Body>
      </View>
    </View>
  )
}
