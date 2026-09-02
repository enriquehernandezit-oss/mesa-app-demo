import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, EmptyState, Eyebrow, Title, Wordmark } from '@/components/ui'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScrollView, View } from 'react-native'

// In-app legal pages. Apple requires the Privacy Policy and Terms to be reachable
// inside the app (App Store 5.1), so these exist and are linked from Settings.
// They render regardless of auth state (top-level route, outside the gate) so a
// signed-out member can still read them. Ported from apps/app/src/screens/legal/
// LegalPage.tsx — copy carried over verbatim.
//
// The copy below is a STARTER draft — the founder/counsel finalizes it before
// submission (and can point these at hosted URLs instead). An Apple-standard
// EULA is acceptable for the EULA (App Store 1.2). Register is neutral/formal,
// which is normal for legal text even in an otherwise informal product.
type Doc = 'terms' | 'eula' | 'privacy'

const DOCS: Record<Doc, { title: string; body: string[] }> = {
  privacy: {
    title: 'Política de Privacidad',
    body: [
      'Mesa es una app social de descubrimiento de restaurantes y vida nocturna para Santo Domingo. Esta política explica qué recopilamos y por qué.',
      'Información de cuenta: cuando inicias sesión con Instagram, Apple, o tu teléfono, guardamos el identificador que nos da ese proveedor más el perfil que configuras (nombre, usuario, sector).',
      'Contactos: si eliges buscar amigos en tus contactos, comparamos números de teléfono contra los usuarios de Mesa en nuestro servidor y nunca guardamos tu lista de contactos. Esto es opcional y se pide solo en ese momento.',
      'Contenido que creas: tus rankings y notas de vibe son visibles para las personas que te siguen. Puedes editarlos o eliminarlos cuando quieras.',
      'Uso: actividad básica de la app para mantener el servicio funcionando. No te rastreamos en otras apps ni vendemos tus datos.',
      'Eliminación: puedes eliminar tu cuenta desde Perfil → ajustes en cualquier momento; esto borra tus datos.',
      'BORRADOR — pendiente de revisión legal antes de publicar.',
    ],
  },
  terms: {
    title: 'Términos de Servicio',
    body: [
      'Al usar Mesa aceptas estos términos.',
      'Sé un buen invitado: nada de acoso, spam, o contenido inapropiado. Las notas de vibe son contenido de usuario y están sujetas a moderación — el contenido puede ser reportado, eliminado, y las cuentas pueden ser bloqueadas o expulsadas.',
      'Las solicitudes de reserva son un enlace: Mesa abre WhatsApp o una llamada al restaurante con tu solicitud. Mesa no hace ni garantiza reservas.',
      'Mesa se ofrece tal cual mientras seguimos construyendo. Las funciones pueden cambiar.',
      'BORRADOR — pendiente de revisión legal antes de publicar.',
    ],
  },
  eula: {
    title: 'Acuerdo de Licencia de Usuario Final',
    body: [
      'Mesa te otorga una licencia personal e intransferible para usar la app.',
      'Hay tolerancia cero para contenido inapropiado o comportamiento abusivo. Aceptas no publicar ese tipo de contenido. Podemos eliminar contenido y cerrar cuentas que violen este acuerdo.',
      'El EULA estándar de Apple también aplica donde sea requerido.',
      'BORRADOR — un EULA estándar de Apple es aceptable aquí (App Store 1.2).',
    ],
  },
}

export default function LegalPage() {
  const { doc } = useLocalSearchParams<{ doc: string }>()
  const router = useRouter()
  const entry = DOCS[doc as Doc]
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'))

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel="Volver a Mesa" />
      {!entry ? (
        <EmptyState>Documento no encontrado.</EmptyState>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-12">
          <Wordmark size={32} />
          <Eyebrow className="mt-4">Legal</Eyebrow>
          <Title className="mb-5">{entry.title}</Title>
          <View className="gap-4">
            {entry.body.map((paragraph) => (
              <Body key={paragraph.slice(0, 24)}>{paragraph}</Body>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}
