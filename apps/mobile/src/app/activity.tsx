import { ScreenHeader } from '@/components/ScreenHeader'
import { Body } from '@/components/ui'
import { useRouter } from 'expo-router'
import { View } from 'react-native'

// N3 stub — real "Actividad" screen arrives in a later phase.
export default function ActividadScreen() {
  const router = useRouter()
  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={() => router.back()} backLabel="Atrás" />
      <View className="flex-1 items-center justify-center px-5">
        <Body className="text-center">Pantalla "Actividad" — próximamente.</Body>
      </View>
    </View>
  )
}
