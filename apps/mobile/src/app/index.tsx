import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  Eyebrow,
  SectionHeader,
  SerifItalic,
  Skeleton,
  Title,
  Toggle,
  Wordmark,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import {
  BookmarkIcon,
  CompassIcon,
  HeartIcon,
  SettingsIcon,
  ShareIcon,
} from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { useTheme } from '@/theme/ThemeProvider'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// N1 gallery: exercises every ported primitive in both themes. Replaced by the
// real App gate in N2. Not a shipping screen — a verification surface.
export default function Index() {
  const { resolved, choice, setChoice } = useTheme()
  const [on, setOn] = useState(true)

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style={resolved === 'candlelit' ? 'light' : 'dark'} />
      <ScrollView contentContainerClassName="gap-4 px-5 py-6">
        <View className="items-center gap-1">
          <Wordmark size={56} />
          <Eyebrow className="font-mono">Una revolución gastronómica social</Eyebrow>
        </View>

        <SectionHeader>Tipografía</SectionHeader>
        <Title>Título en serif</Title>
        <SerifItalic className="text-serif-md">Nota en serif itálica</SerifItalic>
        <Body>Cuerpo en Plus Jakarta Sans, el texto de lectura.</Body>
        <Caption>Caption / metadata en tono apagado</Caption>

        <SectionHeader action={<Caption>3 variantes</Caption>}>Botones</SectionHeader>
        <Button onPress={() => toast({ message: 'Guardado ✓' })}>Botón primario</Button>
        <Button variant="secondary">Secundario</Button>
        <Button variant="ghost">Ghost</Button>
        <Button mono variant="secondary">
          Etiqueta mono
        </Button>

        <SectionHeader>Chips</SectionHeader>
        <ChipRail>
          <Chip>Default</Chip>
          <Chip state="active">Activo</Chip>
          <Chip state="selected">Seleccionado</Chip>
          <Chip size="sm">sm</Chip>
          <Chip size="sm" state="selected">
            sm on
          </Chip>
        </ChipRail>

        <SectionHeader>Card + skeleton</SectionHeader>
        <Card>
          <Title className="text-serif-md">Una tarjeta</Title>
          <Body>Sobre la superficie, con hairline cálido.</Body>
        </Card>
        <Skeleton height={16} />
        <Skeleton height={16} width="60%" />

        <SectionHeader>Avatares + iconos</SectionHeader>
        <View className="flex-row items-center gap-3">
          <Avatar name="Ana" size={44} />
          <Avatar name="Diego" size={44} />
          <Avatar name="María" size={44} />
          <SettingsIcon size={22} color="text" />
          <ShareIcon size={22} color="text" />
          <BookmarkIcon size={22} color="accent" />
          <HeartIcon size={22} color="status-packed" />
          <CompassIcon size={22} color="accent-strong" />
        </View>

        <SectionHeader>Estados</SectionHeader>
        <ErrorState onRetry={() => toast({ variant: 'error', message: 'Reintentando…' })}>
          No se pudo cargar.
        </ErrorState>
        <EmptyState body="Rankea un lugar para empezar.">Aún no hay nada aquí.</EmptyState>

        <SectionHeader>Toggle + tema</SectionHeader>
        <View className="flex-row items-center justify-between">
          <Body>Solo amigos</Body>
          <Toggle checked={on} onChange={setOn} label="Solo amigos" />
        </View>
        <Button
          variant="secondary"
          onPress={() => setChoice(choice === 'candlelit' ? 'afternoon' : 'candlelit')}
        >
          Tema: {resolved}
        </Button>
      </ScrollView>
    </SafeAreaView>
  )
}
