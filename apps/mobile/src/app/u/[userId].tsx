import { ScreenHeader } from '@/components/ScreenHeader'
import { Body } from '@/components/ui'
import { useRouter } from 'expo-router'
import { View } from 'react-native'

// N4 stub — another member's rankings ("passport") is ported later in this
// milestone. Kept as a real route so friends' scores link to a real profile.
export default function UserRankingsScreen() {
  const router = useRouter()
  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={() => router.back()} backLabel="Atrás" />
      <View className="flex-1 items-center justify-center px-5">
        <Body className="text-center">Perfil — próximamente.</Body>
      </View>
    </View>
  )
}
