import { TopBar } from '@/components/TopBar'
import { Body, SectionHeader } from '@/components/ui'
import { ScrollView, View } from 'react-native'

// N3 stub — the real Rankings screen arrives in a later phase.
export default function RankingsScreen() {
  return (
    <View className="flex-1 bg-bg">
      <TopBar variant="discover" title="Rankings" />
      <ScrollView contentContainerClassName="px-5 pb-8">
        <SectionHeader>Rankings</SectionHeader>
        <Body>Pantalla "Rankings" — contenido en una fase próxima.</Body>
        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
