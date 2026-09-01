import { ScreenHeader } from '@/components/ScreenHeader'
import { Body } from '@/components/ui'
import { useRouter } from 'expo-router'
import { View } from 'react-native'

// N4 stub — the "add a dish" composer (reads ?restaurant) is ported next in this
// milestone. Kept as a real route so the "+ Agregar un plato" action resolves.
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
