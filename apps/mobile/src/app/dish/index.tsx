import { Body, Button, Caption, Chip, Eyebrow, SectionHeader, Title, Toggle } from '@/components/ui'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { showActionSheet } from '@/lib/actionSheet'
import { ApiError, api } from '@/lib/api'
import { GRAIN_LABEL_ES } from '@/lib/display'
import { tapSuccess } from '@/lib/haptics'
import { resizeToJpeg } from '@/lib/image'
import type { RestaurantProfileResponse } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Grain = 'candlelit' | 'daylight' | 'none'
const GRAINS: { value: Grain; label: string }[] = [
  { value: 'candlelit', label: GRAIN_LABEL_ES.candlelit as string },
  { value: 'daylight', label: GRAIN_LABEL_ES.daylight as string },
  { value: 'none', label: GRAIN_LABEL_ES.none as string },
]

// Post a dish (Phase 6 mocks C1–C2) — a photo attached to a place you've ranked.
// Two steps: C1 choose the shot + treatment, C2 name/caption/toggles + link. The
// linked ranking is required and carries the score, so it's never re-entered.
// Ported from apps/app/src/screens/dish/DishCompose.tsx; the <input type=file> +
// canvas resize become expo-image-picker + expo-image-manipulator (lib/image).
// The grain treatment is sent as a field but not previewed (a Cloudinary
// delivery transform in prod; RN can't apply the CSS filter the web preview used).
export default function DishCompose() {
  const { restaurant: restaurantId } = useLocalSearchParams<{ restaurant: string }>()
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const placeholder = useColor('text-muted')

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/r/${restaurantId}`))

  const q = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${restaurantId}`),
    retry: false,
  })

  const [step, setStep] = useState<'photo' | 'details'>('photo')
  const [image, setImage] = useState<string | null>(null)
  const [grain, setGrain] = useState<Grain>('candlelit')
  const [name, setName] = useState('')
  const [caption, setCaption] = useState('')
  const [wantToTry, setWantToTry] = useState(false)
  const [friendsOnly, setFriendsOnly] = useState(true)
  const posted = useRef(false)
  const captionRef = useRef<TextInput>(null)

  const post = useMutation({
    mutationFn: async () => {
      await api.post('/dishes', {
        restaurantId,
        name: name.trim(),
        caption: caption.trim() || undefined,
        image,
        grain,
        visibility: friendsOnly ? 'friends' : 'public',
      })
      if (wantToTry) await api.post('/saved', { restaurantId }).catch(() => {})
    },
    onSuccess: () => {
      posted.current = true
      tapSuccess()
      queryClient.invalidateQueries({ queryKey: ['dishes', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      goBack()
    },
  })

  // Hardware back / edge-swipe at step 2 unwinds to the photo step instead of
  // leaving the composer (mirrors RankAPlace's beforeRemove guard).
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (step !== 'details' || posted.current) return
      e.preventDefault()
      setStep('photo')
    })
    return sub
  }, [navigation, step])

  // One tap target, one system chooser — the screen used to have two separate
  // entry points (a "Cámara" header button and the box for the library), which
  // is a menu pretending not to be one.
  async function choosePhoto() {
    const picked = await showActionSheet({
      options: [{ label: 'Tomar foto' }, { label: 'Elegir de la biblioteca' }],
    })
    if (picked === null) return
    await pickFrom(picked === 0 ? 'camera' : 'library')
  }

  async function pickFrom(source: 'camera' | 'library') {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
    const asset = res.canceled ? null : res.assets[0]
    if (asset) {
      setImage(
        await resizeToJpeg(asset.uri, asset.width, asset.height, { maxEdge: 1280, quality: 0.72 }),
      )
    }
  }

  const restaurant = q.data?.restaurant
  const myRanking = q.data?.myRanking ?? null
  const hasRanked = Boolean(myRanking)

  // Gate: a dish must attach to a ranking.
  if (q.isSuccess && !hasRanked) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
        <BackBar label="‹ Atrás" onPress={goBack} />
        <Eyebrow className="mt-3">Publicar un plato</Eyebrow>
        <Title>{restaurant?.name ?? 'Un plato'}</Title>
        <View className="mt-6 items-center gap-4">
          <Body className="text-center">
            Rankea este spot primero — un plato se vincula a tu ranking.
          </Body>
          <Button
            variant="primary"
            className="w-auto px-6"
            onPress={() => router.replace(`/rank?restaurant=${restaurantId}`)}
          >
            Rankear
          </Button>
        </View>
      </View>
    )
  }

  // C1 — choose the shot + treatment.
  if (step === 'photo') {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
        <BackBar label="✕ Cancelar" onPress={goBack} />

        <Pressable
          accessibilityRole="button"
          onPress={choosePhoto}
          className="mt-3 aspect-square w-full items-center justify-center overflow-hidden rounded border border-line border-dashed bg-bg-sunk active:opacity-90"
        >
          {image ? (
            <>
              <Image
                source={{ uri: image }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
              <View className="absolute right-3 bottom-3 rounded-pill bg-surface px-2 py-1">
                <Caption className="font-mono text-[10px]">film · {GRAIN_LABEL_ES[grain]}</Caption>
              </View>
            </>
          ) : (
            <Text className="font-ui-medium text-label text-text-muted">＋ Agregar una foto</Text>
          )}
        </Pressable>

        {image && (
          <View className="mt-3 flex-row gap-2">
            {GRAINS.map((g) => (
              <Chip
                key={g.value}
                size="sm"
                state={grain === g.value ? 'selected' : 'default'}
                onPress={() => setGrain(g.value)}
              >
                {g.label}
              </Chip>
            ))}
          </View>
        )}

        <View className="flex-1" />
        <View style={{ paddingBottom: insets.bottom + 12 }}>
          <Button variant="primary" disabled={!image} onPress={() => setStep('details')}>
            Siguiente
          </Button>
        </View>
      </View>
    )
  }

  // C2 — name, caption, linked ranking, and the two toggles.
  const canPost = name.trim().length > 0 && !post.isPending
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <View className="px-5">
        <BackBar label="‹ Nuevo plato" onPress={() => setStep('photo')} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-8"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <View className="mt-3 flex-row gap-3">
          {image ? (
            <View className="h-20 w-20 overflow-hidden rounded">
              <Image
                source={{ uri: image }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
          ) : null}
          <View className="flex-1">
            <TextInput
              className="border-line border-b pb-1 font-serif text-serif-md text-text"
              placeholderTextColor={placeholder}
              placeholder="Short rib, 14 horas…"
              maxLength={60}
              value={name}
              onChangeText={setName}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => captionRef.current?.focus()}
            />
            <Caption className="mt-1 font-mono text-[10px]">Nombre del plato</Caption>
            <TextInput
              className="mt-2 border-line border-b pb-1 font-ui text-body text-text"
              placeholderTextColor={placeholder}
              ref={captionRef}
              placeholder="Se deshace con el tenedor."
              maxLength={140}
              value={caption}
              onChangeText={setCaption}
              returnKeyType="done"
            />
          </View>
        </View>

        {myRanking && restaurant && (
          <>
            <SectionHeader>Ranking vinculado</SectionHeader>
            <View className="flex-row items-center gap-3 rounded border border-line bg-surface p-3">
              <View className="flex-1">
                <Text className="font-serif text-serif-md text-text">{restaurant.name}</Text>
                <Characteristics
                  priceTier={restaurant.priceTier}
                  cuisine={restaurant.cuisine}
                  neighborhood={restaurant.neighborhood?.name}
                />
              </View>
              <ScoreBadge size="sm" score={myRanking.score} attribution={{ kind: 'you' }} />
            </View>
          </>
        )}

        <View className="mt-4 flex-row items-center justify-between border-line border-b py-3">
          <Text className="flex-1 font-ui text-body text-text">
            También agregar a Quiero probar
          </Text>
          <Toggle
            checked={wantToTry}
            onChange={setWantToTry}
            label="También agregar a Quiero probar"
          />
        </View>
        <View className="flex-row items-center justify-between border-line border-b py-3">
          <Text className="flex-1 font-ui text-body text-text">Compartir solo con amigos</Text>
          <Toggle
            checked={friendsOnly}
            onChange={setFriendsOnly}
            label="Compartir solo con amigos"
          />
        </View>

        {post.error instanceof ApiError && post.error.code === 'rank_it_first' && (
          <Caption className="mt-3 text-status-packed">Rankea este spot primero.</Caption>
        )}

        <View className="mt-6">
          <Button variant="primary" disabled={!canPost} onPress={() => post.mutate()}>
            {post.isPending ? 'Publicando…' : 'Publicar plato'}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}

function BackBar({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[44px] self-start justify-center active:opacity-60"
    >
      <Text className="font-ui-medium text-label text-text-muted">{label}</Text>
    </Pressable>
  )
}
