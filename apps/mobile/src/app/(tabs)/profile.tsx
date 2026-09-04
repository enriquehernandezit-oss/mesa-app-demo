import { RANK_FAB_CLEARANCE } from '@/components/RankFab'
import { TopBar } from '@/components/TopBar'
import { Button, Caption, Chip, Eyebrow, SerifItalic } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Field } from '@/components/ui/Field'
import { BookmarkIcon, CheckIcon, ChevronIcon, CompassIcon } from '@/components/ui/icons'
import { Stat } from '@/components/ui/patterns'
import { useProfile } from '@/hooks/useProfile'
import { api } from '@/lib/api'
import { cuisineLabel } from '@/lib/display'
import { resizeToJpeg } from '@/lib/image'
import { shareProfile } from '@/lib/shareProfile'
import type { MeStats, Neighborhood } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// The user's own profile (Phase 6 mock E1): centered identity + avatar picker, a
// stats trio, edit/share, routes into the lists, and the two stat cards. The top
// bar (name + share + settings) is TopBar's profile variant. Ported from
// apps/app/src/screens/tabs/ProfileTab.tsx; the <input type=file> avatar becomes
// expo-image-picker + resizeToJpeg (square).
export default function ProfileTab() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { data } = useProfile(true)
  const p = data?.profile
  const [editing, setEditing] = useState(false)

  const stats = useQuery({ queryKey: ['me-stats'], queryFn: () => api.get<MeStats>('/me/stats') })

  const setAvatar = useMutation({
    mutationFn: (image: string) => api.patch('/me/avatar', { image }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })
  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
    const asset = res.canceled ? null : res.assets[0]
    if (asset) {
      setAvatar.mutate(
        await resizeToJpeg(asset.uri, asset.width, asset.height, {
          maxEdge: 192,
          square: true,
          quality: 0.8,
        }),
      )
    }
  }

  if (editing) {
    return <EditProfile onClose={() => setEditing(false)} />
  }

  const memberSince =
    p?.createdAt &&
    new Date(p.createdAt).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })
  const barrio = p?.neighborhood?.name

  // One editorial line from the taste stats the API already computes — a read on
  // how you eat, not another number. Elliptical "comida <cuisine>", so the
  // feminine cuisine label reads naturally, and all three null shapes hold.
  const topCuisine = stats.data?.topCuisine
    ? cuisineLabel(stats.data.topCuisine)?.toLowerCase()
    : null
  const topHood = stats.data?.topNeighborhood
  const tasteLine =
    topCuisine && topHood
      ? `Comes sobre todo ${topCuisine}, casi siempre en ${topHood}.`
      : topCuisine
        ? `Comes sobre todo ${topCuisine}.`
        : topHood
          ? `Rankeas casi siempre en ${topHood}.`
          : null

  return (
    <View className="flex-1 bg-bg">
      <TopBar variant="profile" title={p?.name || 'Tú'} shareHandle={p?.handle} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: RANK_FAB_CLEARANCE }}
      >
        <View className="items-center pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cambiar foto"
            onPress={pickAvatar}
            className="items-center active:opacity-80"
          >
            <Avatar name={p?.name || p?.handle || 'm'} src={p?.image} size={88} />
            <Caption className="mt-1 font-mono text-micro text-accent-strong">
              {setAvatar.isPending ? '…' : '+ foto'}
            </Caption>
          </Pressable>
          {p?.handle ? (
            <Text className="mt-2 font-mono text-label text-text-2">@{p.handle}</Text>
          ) : null}
          <Caption className="mt-1">
            {[memberSince && `Miembro desde ${memberSince}`, barrio].filter(Boolean).join(' · ')}
          </Caption>
          {tasteLine ? (
            <SerifItalic className="mt-2 px-6 text-center text-serif-sm text-text-2">
              {tasteLine}
            </SerifItalic>
          ) : null}
        </View>

        {/* The same trio as another member's passport — the two are the same
            object and should read that way. "Rank en RD" used to sit here AND in
            the stat card below, the same number twice on one screen; it belongs
            with the other achievement number, so it lives in the card only. */}
        {stats.data && (
          <View className="mt-5 flex-row justify-around">
            <Stat n={String(stats.data.followers)} l="Seguidores" />
            <Stat n={String(stats.data.following)} l="Siguiendo" />
            <Stat n={String(stats.data.places)} l="Rankeados" />
          </View>
        )}

        <View className="mt-5 flex-row gap-3">
          <Button variant="secondary" className="flex-1" onPress={() => setEditing(true)}>
            Editar perfil
          </Button>
          <Button variant="secondary" className="flex-1" onPress={() => shareProfile(p?.handle)}>
            Compartir perfil
          </Button>
        </View>

        <View className="mt-6">
          {/* No count here — the trio above already carries it. */}
          <NavRow
            icon={<CheckIcon size={15} />}
            label="Rankeados"
            onPress={() => router.push('/rankings')}
          />
          <NavRow
            icon={<BookmarkIcon size={15} />}
            label="Quiero probar"
            onPress={() => router.push('/rankings?tab=saved')}
          />
          {/* Was "Recomendados para ti", which promised a personalized list this
              row never opened — it goes to Explore, whose default browse state
              is exactly that query. The label now says where it goes. */}
          <NavRow
            icon={<CompassIcon size={15} />}
            label="Explorar spots"
            onPress={() => router.push('/explore')}
          />
        </View>

        {stats.data && (
          <View className="mt-6 flex-row gap-3">
            <StatCard
              label="Rank en RD"
              value={stats.data.rankInDr != null ? `#${stats.data.rankInDr}` : '—'}
            />
            <StatCard
              label="Racha actual"
              value={
                stats.data.streakWeeks > 0
                  ? `${stats.data.streakWeeks} semana${stats.data.streakWeeks > 1 ? 's' : ''}`
                  : 'Aún ninguna'
              }
            />
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function NavRow({
  icon,
  label,
  meta,
  onPress,
}: { icon: ReactNode; label: string; meta?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center justify-between border-line border-b py-4 active:opacity-70"
    >
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="font-ui text-body text-text">{label}</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {meta ? <Caption className="font-mono">{meta}</Caption> : null}
        <ChevronIcon size={16} color="text-faint" />
      </View>
    </Pressable>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded border border-line bg-surface p-4">
      <Caption className="font-mono text-micro">{label}</Caption>
      <Text style={DATA_FIGURES} className="mt-1 font-serif text-serif-lg text-accent">
        {value}
      </Text>
    </View>
  )
}

// Minimal edit sheet — name, @handle, sector, bio → PATCH /me/profile.
function EditProfile({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data } = useProfile(true)
  const p = data?.profile
  const [name, setName] = useState(p?.name ?? '')
  const [handle, setHandle] = useState(p?.handle ?? '')
  const [bio, setBio] = useState(p?.bio ?? '')
  const [slug, setSlug] = useState('')
  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const currentSlug =
    slug ||
    neighborhoods.data?.neighborhoods.find((n) => n.name === p?.neighborhood?.name)?.slug ||
    ''

  const save = useMutation({
    mutationFn: () =>
      api.patch('/me/profile', {
        name: name.trim(),
        handle: handle.trim().replace(/^@/, '') || undefined,
        neighborhoodSlug: currentSlug,
        bio: bio.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      onClose()
    },
  })
  const canSave = name.trim().length > 0 && currentSlug.length > 0 && !save.isPending

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10 pt-14"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-ui-medium text-label text-text-muted">‹ Editar perfil</Text>
        </Pressable>

        <View className="mt-2 gap-4">
          <Field
            label="Nombre"
            value={name}
            onChangeText={setName}
            maxLength={60}
            textContentType="name"
            autoComplete="name"
          />
          <Field
            label="@usuario"
            value={handle}
            onChangeText={setHandle}
            placeholder="tuusuario"
            maxLength={30}
            // iOS capitalizes and autocorrects this by default — it's a handle.
            autoCapitalize="none"
            autoCorrect={false}
            error={save.error ? 'Prueba con otro usuario.' : undefined}
          />
          <View>
            <Eyebrow className="mb-2 font-mono">Sector</Eyebrow>
            <View className="flex-row flex-wrap gap-2">
              {neighborhoods.data?.neighborhoods.map((n) => (
                <Chip
                  key={n.slug}
                  size="sm"
                  state={currentSlug === n.slug ? 'selected' : 'default'}
                  onPress={() => setSlug(n.slug)}
                >
                  {n.name}
                </Chip>
              ))}
            </View>
          </View>
          <Field label="Bio" value={bio} onChangeText={setBio} maxLength={120} />
        </View>

        <View className="mt-6">
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!canSave}
            onPress={() => save.mutate()}
          >
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}
