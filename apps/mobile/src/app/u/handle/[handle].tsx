import { ScreenHeader } from '@/components/ScreenHeader'
import { EmptyState, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { View } from 'react-native'

// The landing point for a shared profile link (`/p/u/@ana`, rewritten by
// +native-intent). Share links address people by handle; every in-app profile
// route is keyed by id — so this resolves one to the other and gets out of the
// way. It renders a passport-shaped skeleton while it does, so arriving from a
// tapped link doesn't flash an empty screen.
export default function ResolveHandle() {
  const { handle } = useLocalSearchParams<{ handle: string }>()
  const router = useRouter()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const q = useQuery({
    queryKey: ['handle', handle],
    queryFn: () => api.get<{ userId: string }>(`/social/by-handle/${handle}`),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  // Replace, never push: the resolver is plumbing, and backing out of a profile
  // shouldn't land on a spinner that resolves forward again.
  if (q.data) return <Redirect href={`/u/${q.data.userId}`} />

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel="Atrás" />
      {q.isError ? (
        <EmptyState body="Puede que la cuenta ya no exista.">Perfil no disponible.</EmptyState>
      ) : (
        <View className="items-center gap-3 px-5 pt-6">
          <Skeleton height={88} width={88} />
          <Skeleton height={14} width={120} />
          <Skeleton height={11} width={180} />
        </View>
      )}
    </View>
  )
}
