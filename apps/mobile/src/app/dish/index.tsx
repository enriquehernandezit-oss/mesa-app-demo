import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  Body,
  Button,
  Caption,
  Chip,
  ErrorState,
  Eyebrow,
  SectionHeader,
  Title,
  Toggle,
} from '@/components/ui'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import {
  categoryLabel,
  groupLabel,
  guessDishCategory,
  useDishCategories,
} from '@/lib/dishCategories'
import { pickDishPhoto } from '@/lib/dishPhoto'
import { type Grain, grainLabel, grainOptions } from '@/lib/display'
import { captureError } from '@/lib/errors'
import { tapSuccess } from '@/lib/haptics'
import { useLanguage, useT } from '@/lib/i18n'
import { usePreventRemove } from '@/lib/preventRemove'
import type { DishNudge, RestaurantProfileResponse } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// Post a dish (Phase 6 mocks C1–C2) — a photo attached to a place you've ranked.
// Two steps: C1 choose the shot + treatment, C2 name/caption/toggles + link. The
// linked ranking is required and carries the score, so it's never re-entered.
// Ported from apps/app/src/screens/dish/DishCompose.tsx; the <input type=file> +
// canvas resize become expo-image-picker + expo-image-manipulator (lib/image).
// The grain treatment is sent as a field but not previewed (a delivery-time
// transform once one exists; RN can't apply the CSS filter the web preview used).
export default function DishCompose() {
  const t = useT()
  const lang = useLanguage()
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
  const categoriesQuery = useDishCategories()

  const [image, setImage] = useState<string | null>(null)
  const [grain, setGrain] = useState<Grain>('candlelit')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [caption, setCaption] = useState('')
  const [friendsOnly, setFriendsOnly] = useState(true)
  const [posted, setPosted] = useState(false)
  const goneRef = useRef(false)
  const captionRef = useRef<TextInput>(null)

  // The category pills pre-select a keyword guess so picking one is usually
  // zero taps; it stops re-guessing the moment the member picks one themselves,
  // even if they keep editing the name afterward.
  useEffect(() => {
    if (categoryTouched) return
    if (!name.trim() || !categoriesQuery.data) return
    setCategoryId(guessDishCategory(name, categoriesQuery.data.categories))
  }, [name, categoryTouched, categoriesQuery.data])

  const categories = categoriesQuery.data?.categories ?? []
  const groups = categoriesQuery.data?.groups ?? []
  const currentCategory = categories.find((c) => c.id === categoryId) ?? null
  const currentGroup = groups.find((g) => g.id === currentCategory?.group) ?? null

  // Two sequential dropdown pills (M13), not the old inline search-and-select
  // picker: the composer is a native modal, and Mesa's own Sheet can't render
  // above one (see lib/actionSheet.ts's header comment) — a flat 65-item
  // action sheet would be a scrolling wall, so "Cocina" narrows to one of the
  // 15 groups first and "Plato" only ever lists that group's categories.
  // Both list options with a "✓ " prefix on the current one — ActionSheetIOS
  // has no separate selected-state affordance to hang a checkmark on.
  async function pickGroup() {
    if (groups.length === 0) return
    const idx = await showActionSheet({
      title: t('dish.cuisine_pill'),
      options: groups.map((g) => ({
        label: `${g.id === currentGroup?.id ? '✓ ' : ''}${groupLabel(g, lang)}`,
      })),
    })
    if (idx === null) return
    const group = groups[idx]
    const inGroup = categories
      .filter((c) => c.group === group.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    if (inGroup[0]) {
      setCategoryId(inGroup[0].id)
      setCategoryTouched(true)
    }
  }

  async function pickCategory() {
    const inGroup = categories
      .filter((c) => c.group === currentGroup?.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    if (inGroup.length === 0) return
    const idx = await showActionSheet({
      title: t('dish.category_label'),
      options: inGroup.map((c) => ({
        label: `${c.id === categoryId ? '✓ ' : ''}${categoryLabel(c, lang)}`,
      })),
    })
    if (idx === null) return
    setCategoryId(inGroup[idx].id)
    setCategoryTouched(true)
  }

  const post = useMutation({
    mutationFn: () =>
      api.post<{ nudge: DishNudge | null }>('/dishes', {
        restaurantId,
        name: name.trim(),
        categoryId,
        caption: caption.trim() || undefined,
        image: image ?? undefined,
        grain: image ? grain : 'none',
        visibility: friendsOnly ? 'friends' : 'public',
      }),
    onSuccess: (res) => {
      track('dish_posted', { grain, friendsOnly, hasPhoto: image !== null, category: categoryId })
      setPosted(true)
      tapSuccess()
      queryClient.invalidateQueries({ queryKey: ['dishes', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      // Repeat-dish nudge (M20) — the composer closes right after this, so a
      // toast (not an inline card) is the only affordance that survives the
      // screen going away; its action is the entire path into the flow.
      if (res.nudge) {
        toast({
          message:
            res.nudge.kind === 'first'
              ? t('dishLists.nudge_toast_first', { label: res.nudge.label })
              : t('dishLists.nudge_toast_insert', { label: res.nudge.label }),
          action: {
            label: t('dishLists.rank_button'),
            onClick: () => router.push(`/dish-lists/rank?listId=${res.nudge?.listId}`),
          },
        })
      }
    },
    onError: (err) => {
      captureError(err, 'dish.post')
      toast({
        variant: 'error',
        message: t('dish.post_error'),
        action: { label: t('common.retry'), onClick: () => post.mutate() },
      })
    },
  })

  // Leaves once a post succeeds — done in an effect, not inline in onSuccess,
  // so the render that flips `posted` to true (and so `dirty` to false) lands
  // before goBack() asks the navigator to remove the screen; calling it
  // synchronously in onSuccess would still see the OLD `dirty=true` closure
  // usePreventRemove registered for this render and block its own exit.
  // oxlint-disable react/exhaustive-deps -- one-shot on `posted`; goBack is stable enough (router + a route param) not to need retriggering this.
  useEffect(() => {
    if (posted && !goneRef.current) {
      goneRef.current = true
      goBack()
    }
  }, [posted])
  // oxlint-enable react/exhaustive-deps

  // Swipe-down-to-dismiss (and Android hardware back) closes the composer
  // outright once nothing's been entered.
  const dirty = !posted && (name.trim() !== '' || image !== null || caption.trim() !== '')
  usePreventRemove(dirty, ({ data }) => {
    showActionSheet({
      title: t('dish.discard_title'),
      options: [{ label: t('dish.discard_button'), destructive: true }],
    }).then((idx) => {
      if (idx === 0) navigation.dispatch(data.action)
    })
  })

  // One tap target, one system chooser — the screen used to have two separate
  // entry points (a "Cámara" header button and the box for the library), which
  // is a menu pretending not to be one. The pick→permission→resize pipeline
  // itself lives in lib/dishPhoto.ts, shared with the rank flow's inline photo
  // step (app/rank.tsx) — one place for that error-prone chain, not two.
  async function choosePhoto() {
    const uri = await pickDishPhoto()
    if (uri) setImage(uri)
  }

  const restaurant = q.data?.restaurant
  const myRanking = q.data?.myRanking ?? null
  const hasRanked = Boolean(myRanking)

  // `retry: false` on the query above means a failed fetch used to leave this
  // screen silently rendering with an undefined restaurant — no message, no
  // way to try again.
  if (q.isError) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
        <BackBar label={t('common.back')} onPress={goBack} />
        <ErrorState onRetry={() => q.refetch()}>{t('dish.load_error')}</ErrorState>
      </View>
    )
  }

  // Gate: a dish must attach to a ranking.
  if (q.isSuccess && !hasRanked) {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
        <BackBar label={t('common.back')} onPress={goBack} />
        <Eyebrow className="mt-3">{t('dish.post_title')}</Eyebrow>
        <Title>{restaurant?.name ?? t('dish.default_name')}</Title>
        <View className="mt-6 items-center gap-4">
          <Body className="text-center">{t('dish.rank_first_body')}</Body>
          <Button
            variant="primary"
            className="w-auto px-6"
            onPress={() => router.replace(`/rank?restaurant=${restaurantId}`)}
          >
            {t('dish.rank_button')}
          </Button>
        </View>
      </View>
    )
  }

  // Name-first: a dish can be logged with just a name + category, so the
  // photo (still the richest post) is one optional block among several
  // rather than a gate the whole flow gets stuck behind.
  const canPost = name.trim().length > 0 && categoryId !== null && !post.isPending
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(insets.top, 12) + 12 }}>
      <View className="px-5">
        <BackBar label={t('dish.cancel')} onPress={goBack} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-8"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          className="mt-3 border-line border-b pb-1 font-serif text-serif-md text-text"
          placeholderTextColor={placeholder}
          placeholder={t('dish.name_placeholder')}
          maxLength={60}
          value={name}
          onChangeText={setName}
          returnKeyType="next"
        />
        <Caption className="mt-1 text-micro">{t('dish.name_caption')}</Caption>

        <Eyebrow className="mt-4">{t('dish.category_label')}</Eyebrow>
        <View className="mt-2 flex-row gap-2">
          <Chip size="sm" chevron state={currentGroup ? 'active' : 'default'} onPress={pickGroup}>
            {currentGroup ? groupLabel(currentGroup, lang) : t('dish.cuisine_pill')}
          </Chip>
          <Chip
            size="sm"
            chevron
            state={currentCategory ? 'active' : 'default'}
            onPress={pickCategory}
          >
            {currentCategory ? categoryLabel(currentCategory, lang) : t('dish.dish_type_pill')}
          </Chip>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={choosePhoto}
          className="mt-4 aspect-square w-full items-center justify-center overflow-hidden rounded border border-line border-dashed bg-bg-sunk active:opacity-90"
        >
          {image ? (
            <>
              <Image
                source={{ uri: image }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
              <View className="absolute right-3 bottom-3 rounded-pill bg-surface px-2 py-1">
                <Caption className="text-micro">film · {grainLabel(grain)}</Caption>
              </View>
            </>
          ) : (
            <Text className="font-ui-medium text-label text-text-muted">{t('dish.add_photo')}</Text>
          )}
        </Pressable>

        {image && (
          <View className="mt-3 flex-row gap-2">
            {grainOptions().map((g) => (
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

        <Eyebrow className="mt-4">{t('dish.caption_label')}</Eyebrow>
        <TextInput
          className="mt-2 border-line border-b pb-1 font-ui text-body text-text"
          placeholderTextColor={placeholder}
          ref={captionRef}
          placeholder={t('dish.caption_placeholder')}
          maxLength={140}
          value={caption}
          onChangeText={setCaption}
          returnKeyType="done"
        />

        {myRanking && restaurant && (
          <>
            <SectionHeader>{t('dish.linked_ranking')}</SectionHeader>
            {/* router.push, not a dismiss: this only stacks the profile on
                top — the composer (and whatever's typed so far) is still
                there on the way back, same as the rank flow's own nested
                navigations. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/r/${restaurant.id}`)}
              className="flex-row items-center gap-3 rounded border border-line bg-surface p-3 active:opacity-80"
            >
              <View className="flex-1">
                <Text className="font-serif text-serif-md text-text">{restaurant.name}</Text>
                <Characteristics
                  priceTier={restaurant.priceTier}
                  cuisine={restaurant.cuisine}
                  neighborhood={restaurant.neighborhood?.name}
                />
              </View>
              <ScoreBadge size="sm" score={myRanking.score} attribution={{ kind: 'you' }} />
            </Pressable>
          </>
        )}

        <View className="mt-4 flex-row items-center justify-between border-line border-b py-3">
          <Text className="flex-1 font-ui text-body text-text">{t('dish.friends_only_label')}</Text>
          <Toggle
            checked={friendsOnly}
            onChange={setFriendsOnly}
            label={t('dish.friends_only_label')}
          />
        </View>

        {post.error instanceof ApiError && post.error.code === 'rank_it_first' && (
          <Caption className="mt-3 text-status-packed">{t('dish.rank_first_error')}</Caption>
        )}

        <View className="mt-6">
          <Button variant="primary" disabled={!canPost} onPress={() => post.mutate()}>
            {post.isPending ? t('dish.publishing') : t('dish.publish_button')}
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
