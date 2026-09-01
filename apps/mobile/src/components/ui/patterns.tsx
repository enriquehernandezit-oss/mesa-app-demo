import { Caption } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { cuisineLabel, priceLabel, tagLabel } from '@/lib/display'
import { View } from 'react-native'

// The "$$$ | Parrilla · Piantini" metadata block under a place's name, ported
// from apps/app/src/components/ui/patterns.tsx. Occasion tags on top, price |
// cuisine, then neighborhood · distance · hours, then optional friend avatars.
type CharacteristicsProps = {
  occasionTags?: string[]
  priceTier?: number | null
  cuisine?: string | null
  neighborhood?: string | null
  city?: string | null
  hours?: string | null
  distance?: string | null
  social?: { people: { name: string; image?: string | null }[]; label?: string }
}

export function Characteristics({
  occasionTags,
  priceTier,
  cuisine,
  neighborhood,
  city,
  hours,
  distance,
  social,
}: CharacteristicsProps) {
  const priceCuisine = [priceLabel(priceTier), cuisineLabel(cuisine)].filter(Boolean).join(' | ')
  const place = [[neighborhood, city].filter(Boolean).join(', '), distance, hours]
    .filter(Boolean)
    .join(' · ')
  return (
    <View className="mt-1 gap-[2px]">
      {occasionTags && occasionTags.length > 0 && (
        <Caption className="font-mono text-[10px] text-accent-strong">
          {occasionTags.map(tagLabel).join(' · ')}
        </Caption>
      )}
      {priceCuisine ? <Caption className="text-text-2">{priceCuisine}</Caption> : null}
      {place ? <Caption>{place}</Caption> : null}
      {social && social.people.length > 0 && (
        <View className="mt-1 flex-row items-center gap-1">
          {social.people.slice(0, 3).map((p) => (
            <Avatar key={p.name} name={p.name} src={p.image} size={20} />
          ))}
          {social.label ? <Caption className="ml-1">{social.label}</Caption> : null}
        </View>
      )}
    </View>
  )
}
