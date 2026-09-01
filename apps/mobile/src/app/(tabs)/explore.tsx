import { TopBar } from '@/components/TopBar'
import { Body, SectionHeader } from '@/components/ui'
import { ScrollView, View } from 'react-native'

// N3 stub — the real Explora screen arrives in a later phase.
export default function ExploraScreen() {
  return (
    <View className="flex-1 bg-bg">
      <TopBar variant="discover" title="Explora" />
      <ScrollView contentContainerClassName="px-5 pb-8">
        <SectionHeader>Explora</SectionHeader>
        <Body>Pantalla "Explora" — contenido en una fase próxima.</Body>
        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
