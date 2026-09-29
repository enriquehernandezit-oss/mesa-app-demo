import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Row, RowButton, Group } from '@/components/SettingsRow'
import { MAX_SCALE } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import {
  ChevronIcon,
  ClockIcon,
  DirectionsIcon,
  ListIcon,
  MenuIcon,
  PhoneIcon,
  PinIcon,
  WebIcon,
  WineGlassIcon,
} from '@/components/ui/icons'
import { UtilityPill } from '@/components/ui/patterns'
import { showSheet } from '@/components/ui/Sheet'
import { openDirections } from '@/lib/directions'
import { cuisineLabel } from '@/lib/display'
import { closesLabel } from '@/lib/hours'
import { useT } from '@/lib/i18n'
import type { RestaurantProfileResponse } from '@/lib/types'

// The practical half of the details sheet: four round tiles (Menu · Call · Website ·
// Directions — each only when there is something behind it), a grouped list of facts
// (address, hours, price · cuisine, the lists it is in), and the map card that opens the full
// map. `mapUrl` is null without a MapBox token, which hides the card.
export function PlaceInfo({
  restaurant,
  lists,
  mapUrl,
  onOpenMap,
}: {
  restaurant: RestaurantProfileResponse['restaurant']
  lists: RestaurantProfileResponse['lists']
  mapUrl: string | null
  onOpenMap: () => void
}) {
  const t = useT()
  const router = useRouter()
  const closes = closesLabel(restaurant.closesAt)
  const hood = restaurant.neighborhood?.name
  const priceCuisine = [
    restaurant.priceTier ? '$'.repeat(restaurant.priceTier) : null,
    cuisineLabel(restaurant.cuisine),
  ]
    .filter(Boolean)
    .join(' · ')

  async function openLists() {
    if (lists.length === 1) return router.push(`/lists/${lists[0]!.slug}`)
    const idx = await showSheet({
      title: t('place.lists_title'),
      options: lists.map((l) => ({ label: l.title })),
    })
    const picked = idx == null ? null : lists[idx]
    if (picked) router.push(`/lists/${picked.slug}`)
  }

  const rows: { key: string; node: (last: boolean) => ReactNode }[] = []
  if (restaurant.address)
    rows.push({
      key: 'address',
      node: (last) => (
        <InfoRow
          icon={<PinIcon size={18} color="text-2" />}
          title={restaurant.address ?? ''}
          sub={[hood, 'Santo Domingo'].filter(Boolean).join(', ')}
          onPress={onOpenMap}
          last={last}
        />
      ),
    })
  if (closes)
    rows.push({
      key: 'hours',
      node: (last) => (
        <InfoRow
          icon={<ClockIcon size={18} color="text-2" />}
          title={t('place.open_until', { time: closes })}
          last={last}
        />
      ),
    })
  if (priceCuisine)
    rows.push({
      key: 'price',
      node: (last) => (
        <InfoRow
          icon={<WineGlassIcon size={18} color="text-2" />}
          title={priceCuisine}
          last={last}
        />
      ),
    })
  if (lists.length > 0)
    rows.push({
      key: 'lists',
      node: (last) => (
        <InfoRow
          icon={<ListIcon size={18} color="text-2" />}
          title={t('place.in_lists', { n: lists.length })}
          sub={lists.map((l) => l.title).join(' · ')}
          onPress={openLists}
          last={last}
        />
      ),
    })

  return (
    <View>
      <View className="flex-row gap-2 px-5 pt-5">
        {restaurant.hasMenu ? (
          <UtilityPill
            icon={<MenuIcon size={18} />}
            onPress={() =>
              router.push({
                pathname: '/menu/[restaurantId]',
                params: { restaurantId: restaurant.id, name: restaurant.name },
              })
            }
          >
            {t('restaurant.menu_title')}
          </UtilityPill>
        ) : null}
        {restaurant.phone ? (
          <UtilityPill icon={<PhoneIcon size={18} />} href={`tel:${restaurant.phone}`}>
            {t('restaurant.call')}
          </UtilityPill>
        ) : null}
        {restaurant.website ? (
          <UtilityPill icon={<WebIcon size={18} />} href={restaurant.website}>
            {t('restaurant.website')}
          </UtilityPill>
        ) : null}
        <UtilityPill
          icon={<DirectionsIcon size={18} />}
          onPress={() => openDirections(restaurant.lat, restaurant.lng, restaurant.name)}
        >
          {t('restaurant.directions')}
        </UtilityPill>
      </View>

      {rows.length > 0 ? (
        <Group className="mx-4 mt-5">
          {rows.map((r, i) => (
            <View key={r.key}>{r.node(i === rows.length - 1)}</View>
          ))}
        </Group>
      ) : null}

      {mapUrl ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('restaurant.view_on_map', { name: restaurant.name })}
          onPress={onOpenMap}
          className="mx-4 mt-3 h-[150px] overflow-hidden rounded-[26px] active:opacity-90"
        >
          <Image
            source={{ uri: mapUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
          <Glass
            variant="bar"
            radius={16}
            className="absolute bottom-3 right-3 h-8 justify-center px-3"
          >
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-label text-text"
            >
              {t('place.open_map')}
            </Text>
          </Glass>
        </Pressable>
      ) : null}
    </View>
  )
}

function InfoRow({
  icon,
  title,
  sub,
  onPress,
  last,
}: {
  icon: ReactNode
  title: string
  sub?: string
  onPress?: () => void
  last: boolean
}) {
  const inner = (
    <>
      <View className="w-6 items-center">{icon}</View>
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-ui-medium text-body text-text"
        >
          {title}
        </Text>
        {sub ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui text-meta text-text-muted"
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {onPress ? <ChevronIcon size={16} color="text-faint" /> : null}
    </>
  )
  return onPress ? (
    <RowButton onPress={onPress} last={last}>
      {inner}
    </RowButton>
  ) : (
    <Row last={last}>{inner}</Row>
  )
}
