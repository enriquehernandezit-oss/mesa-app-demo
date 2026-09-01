import { ScreenHeader } from '@/components/ScreenHeader'
import { Body } from '@/components/ui'
import { useRouter } from 'expo-router'
import { View } from 'react-native'

// Stub — the "add a dish" composer (reads ?restaurant) is fundamentally a
// photo-capture flow (expo-image-picker + resize/upload), so it lands with the
// native image work in N6, alongside the avatar picker. Kept as a real route now
// so the rank flow's dish-chain and RestaurantProfile's "+ Agregar un plato"
// resolve instead of dead-ending.
export default function DishComposeScreen() {
  const router = useRouter()
  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={() => router.back()} backLabel="Atrás" />
      <View className="flex-1 items-center justify-center px-5">
        <Body className="text-center">Agregar un plato — próximamente.</Body>
      </View>
    </View>
  )
}
