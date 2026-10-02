import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CheersButton } from '@/components/CheersButton'
import { HeroButton } from '@/components/place/PlaceTopChrome'
import { ReportControl } from '@/components/ReportControl'
import { SaveButton } from '@/components/SaveButton'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Caption, EmptyState, ErrorState, MAX_SCALE, Skeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { BackIcon, DirectionsIcon, PhoneIcon, WebIcon } from '@/components/ui/icons'
import { ScoreStack, UtilityPill } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { ApiError, api } from '@/lib/api'
import { openDirections } from '@/lib/directions'
import { categoryLabel, useDishCategories } from '@/lib/dishCategories'
import { cuisineLabel, priceLabel } from '@/lib/display'
import { captureError } from '@/lib/errors'
import { useLanguage, useT } from '@/lib/i18n'
import { timeAgo } from '@/lib/time'
import type { DishDetail as DishDetailData } from '@/lib/types'
import { socialLabelKey } from '@/lib/websiteKind'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'

// Dish detail (Phase 6 mock C3) — a posted dish standing on its own: the hero
// photo, its caption, and the linked ranking (the place card carries the poster's
// attributed score). A dish is never free-floating; the place card is the anchor.
// Ported from apps/app/src/screens/dish/DishDetail.tsx. The grain treatment
// would be a delivery-time transform once one exists, so the photo shows
// untreated here (same as the feed) rather than through a CSS filter RN doesn't have.
// Redesign 2: the photo (else the place's, else a name card) fades into the ground under glass
// back / heart / bookmark buttons; then who posted it, the dish in the serif, their words, the
// place as a raised card, Call / Website / Directions, and Report (or Delete on your own).
const HERO_H = 380

export default function DishDetail() {
  const t = useT()
  const lang = useLanguage()
  const { dishId } = useLocalSearchParams<{ dishId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))
  const categoriesQuery = useDishCategories()

  const queryClient = useQueryClient()
  const bg = useColor('bg')
  const scrim = useColor('photo-scrim')
  const lift = useLift()

  const q = useQuery({
    queryKey: ['dish', dishId],
    queryFn: () => api.get<{ dish: DishDetailData }>(`/dishes/${dishId}`),
    retry: false,
  })

  // Soft-delete server-side (removedAt), so the row survives for moderation
  // while disappearing everywhere a member can see it.
  const remove = useMutation({
    mutationFn: () => api.del(`/dishes/${dishId}`),
    onSuccess: () => {
      // The photo rides in the feed and on the restaurant profile too — and on
      // that restaurant's own dish rail (['dishes', id]), which neither ['dish']
      // (this one post) nor ['restaurant'] (the profile fields) is a prefix of,
      // so it needs its own line or the deleted photo lingers there.
      const restaurantId = q.data?.dish.restaurant.id
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['dish', dishId] })
      queryClient.invalidateQueries({ queryKey: ['restaurant'] })
      if (restaurantId) queryClient.invalidateQueries({ queryKey: ['dishes', restaurantId] })
      toast({ message: t('dish.deleted_toast') })
      goBack()
    },
    onError: (err) => {
      captureError(err, 'dish.delete')
      toast({ variant: 'error', message: t('dish.delete_error') })
    },
  })

  const confirmRemove = async () => {
    const picked = await showActionSheet({
      title: t('dish.confirm_delete_title'),
      message: t('dish.confirm_delete_message'),
      options: [{ label: t('dish.delete_button'), destructive: true }],
    })
    if (picked === 0) remove.mutate()
  }

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <Skeleton height={HERO_H - 60} />
        <View className="gap-3 px-5 pt-4">
          <Skeleton height={22} width="55%" />
          <Skeleton height={12} width="75%" />
          <Skeleton height={64} className="mt-2" />
        </View>
      </View>
    )
  }
  if (q.isError || !q.data) {
    // 404 is a dead end; anything else is worth retrying.
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        {notFound ? (
          <EmptyState>{t('dish.not_found')}</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>{t('dish.detail_load_error')}</ErrorState>
        )}
      </View>
    )
  }

  const { dish } = q.data
  const { restaurant } = dish
  const firstName =
    (dish.user.name || dish.user.handle || '').split(' ')[0] || t('dish.someone_fallback')
  const category = categoriesQuery.data?.categories.find((c) => c.id === dish.categoryId)
  const categoryText = category ? categoryLabel(category, lang) : dish.categoryId
  const meta = [
    cuisineLabel(restaurant.cuisine),
    dish.neighborhood,
    priceLabel(restaurant.priceTier),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <View style={{ height: HERO_H }}>
          <PlaceCover
            name={dish.name}
            coverImageId={dish.imageId ?? restaurant.coverImageId}
            size={{ w: 1000, h: 1000 }}
            className="h-full w-full rounded-none"
          />
          {/* A veil at the top so the status bar and glass buttons read on any photo, and a fade
              at the bottom into the ground the name sits on. */}
          <LinearGradient
            colors={[scrim, 'transparent']}
            locations={[0, 0.3]}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.4 }}
          />
          <LinearGradient
            colors={['transparent', bg]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 }}
          />
        </View>

        <View className="-mt-[18px] px-5">
          {/* The poster — a photo with an attributed score and, until now, no
              way to reach the person it was attributed to. */}
          <Link href={`/u/${dish.user.id}`} asChild>
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center gap-2 active:opacity-80"
            >
              <Avatar
                name={dish.user.name || dish.user.handle || 'm'}
                src={dish.user.image}
                size={28}
              />
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_SCALE}
                className="shrink font-ui-semibold text-subhead text-text"
              >
                {dish.user.name || dish.user.handle}
              </Text>
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui text-subhead text-text-muted"
              >
                · {timeAgo(dish.createdAt)}
              </Text>
            </Pressable>
          </Link>
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-2.5 font-serif text-display text-text"
          >
            {dish.name}
          </Text>
          {dish.categoryId ? <Caption className="mt-1 text-pill">{categoryText}</Caption> : null}
          {dish.caption ? (
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-2 font-serif text-serif-md text-text-2"
            >
              “{dish.caption}”
            </Text>
          ) : null}
        </View>

        {/* The place card — the anchor. Carries the poster's attributed score. */}
        <Link href={`/r/${restaurant.id}`} asChild>
          <Pressable
            accessibilityRole="button"
            className="mx-4 mt-[18px] flex-row items-center gap-3 rounded-group bg-surface p-3 active:opacity-80"
            style={lift}
          >
            <View className="h-[52px] w-[52px] overflow-hidden rounded-[16px]">
              <PlaceCover
                name={restaurant.name}
                coverImageId={restaurant.coverImageId}
                size={{ w: 156, h: 156 }}
                className="h-full w-full rounded-none"
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-serif text-serif-sm text-text"
              >
                {restaurant.name}
              </Text>
              {meta ? (
                <Text
                  numberOfLines={2}
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="mt-0.5 font-ui text-meta text-text-muted"
                >
                  {meta}
                </Text>
              ) : null}
            </View>
            <ScoreStack score={dish.score} label={dish.posterIsMe ? t('common.you') : firstName} />
          </Pressable>
        </Link>

        <View className="mt-3 flex-row flex-wrap gap-2 px-4">
          {restaurant.phone ? (
            <UtilityPill
              layout="chip"
              icon={<PhoneIcon size={18} />}
              href={`tel:${restaurant.phone}`}
            >
              {t('dish.call')}
            </UtilityPill>
          ) : null}
          {restaurant.website ? (
            <UtilityPill layout="chip" icon={<WebIcon size={18} />} href={restaurant.website}>
              {t(socialLabelKey(restaurant.website) ?? 'dish.website')}
            </UtilityPill>
          ) : null}
          <UtilityPill
            layout="chip"
            icon={<DirectionsIcon size={18} />}
            onPress={() => openDirections(restaurant.lat, restaurant.lng, restaurant.name)}
          >
            {t('restaurant.directions')}
          </UtilityPill>
        </View>

        {/* A dish is UGC, so it needs both halves of App Store 1.2: someone
            else's post must be reportable, and your OWN post must be
            removable. The delete endpoint has existed since M6 with no way to
            reach it — a member could publish a photo and never take it down. */}
        <View className="mt-3 px-5">
          {dish.posterIsMe ? (
            <Pressable
              accessibilityRole="button"
              disabled={remove.isPending}
              onPress={confirmRemove}
              className="min-h-[44px] justify-center active:opacity-60"
            >
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui-semibold text-label text-danger"
              >
                {remove.isPending ? t('dish.deleting') : t('dish.delete_this')}
              </Text>
            </Pressable>
          ) : (
            <ReportControl targetType="dish" targetId={dishId} label={t('dish.report_this')} />
          )}
        </View>
      </ScrollView>

      {/* Glass controls laid on the photo — back at the left, the heart and the bookmark at the
          right. Outside the scroll so they stay put while the page moves under them. */}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 flex-row items-center justify-between px-4"
        style={{ top: insets.top + 8 }}
      >
        <HeroButton label={t('common.back_plain')} onPress={goBack}>
          <BackIcon size={20} color="hglass-fg" />
        </HeroButton>
        <View className="flex-row items-center gap-2">
          <CheersButton
            variant="photo"
            target={{ kind: 'dish', id: dishId }}
            count={dish.cheerCount}
            cheered={dish.cheeredByMe}
          />
          <SaveButton
            variant="photo"
            target={{ kind: 'dish', id: dishId }}
            initial={dish.saved}
            name={dish.name}
          />
        </View>
      </View>
    </View>
  )
}
