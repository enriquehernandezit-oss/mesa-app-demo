import { TopBar } from '@/components/TopBar'
import { Body, SectionHeader } from '@/components/ui'
import { ScrollView, View } from 'react-native'

// N3 stub — the real Perfil screen arrives in a later phase.
export default function PerfilScreen() {
  return (
    <View className="flex-1 bg-bg">
      <TopBar variant="profile" title="Perfil" />
      <ScrollView contentContainerClassName="px-5 pb-8">
        <SectionHeader>Perfil</SectionHeader>
        <Body>Pantalla "Perfil" — contenido en una fase próxima.</Body>
        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
