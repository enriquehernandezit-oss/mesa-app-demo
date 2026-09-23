import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { useCallback, useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'

import { useTabBarClearance } from '@/components/MesaTabBar'
import { TopBar } from '@/components/TopBar'
import { Button, Caption, Chip, ErrorState, Eyebrow, SerifItalic, Skeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Field } from '@/components/ui/Field'
import {
  BookmarkIcon,
  CalendarIcon,
  CheckIcon,
  ChevronIcon,
  CompassIcon,
  ForkKnifeIcon,
  ListIcon,
  PlusIcon,
} from '@/components/ui/icons'
import { Stat } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { showSheet } from '@/components/ui/Sheet'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { useResetOnTabPress } from '@/hooks/useResetOnTabPress'
import { api } from '@/lib/api'
import { ALL_CUISINES, cuisineLabel, displayScore } from '@/lib/display'
import { captureError } from '@/lib/errors'
import { dateLocale, useT } from '@/lib/i18n'
import { openImagePicker, resizeToJpeg } from '@/lib/image'
import { isPendingInvite } from '@/lib/plans'
import type { MeStats, Neighborhood, Plan, Ranking } from '@/lib/types'
import { uploadImage } from '@/lib/upload'
import { DATA_FIGURES } from '@/theme/vars'

// Shared avatar-change pipeline: sheet (camera/library) → permission → launch
// → square-crop resize → upload. One implementation for both the main Profile
// screen and Editar perfil, so the two photo controls (previously: main-screen
// tap opened Editar perfil, which then jumped straight to the library with no
// camera option) behave identically. `busy` guards the WHOLE pipeline, not
// just the upload mutation — see dishPhoto.ts's `picking` module guard for the
// same re-entrancy reasoning (expo-image-picker has no native guard of its
// own; a second launch while one is presenting just overwrites the pending
// promise and orphans the first).
function useAvatarPicker() {
  const queryClient = useQueryClient()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const setAvatar = useMutation({
    mutationFn: (image: string) => api.patch('/me/avatar', { image }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
    onError: (err) => {
      captureError(err, 'me.avatar')
      toast({ variant: 'error', message: t('profile.avatar_change_error') })
    },
  })

  async function change() {
    if (busy) return
    setBusy(true)
    try {
      const picked = await showSheet({
        title: t('profile.avatar_photo_title'),
        options: [{ label: t('profile.take_photo') }, { label: t('profile.choose_from_library') }],
      })
      if (picked === null) return
      const source = picked === 0 ? 'camera' : 'library'
      const result = await openImagePicker(source, { square: true })
      if (result.status === 'denied') {
        toast({
          variant: 'error',
          message: t('profile.no_camera_access'),
          action: { label: t('profile.settings_action'), onClick: () => Linking.openSettings() },
        })
        return
      }
      if (result.status !== 'picked') return
      const { asset } = result
      const resized = await resizeToJpeg(asset.uri, asset.width, asset.height, {
        maxEdge: 192,
        square: true,
        quality: 0.8,
      })
      const uploaded = await uploadImage(resized)
      if (!uploaded) {
        toast({ variant: 'error', message: t('profile.avatar_change_error') })
        return
      }
      setAvatar.mutate(uploaded)
    } catch (err) {
      captureError(err, 'image.pick')
      toast({ variant: 'error', message: t('profile.photo_process_error') })
    } finally {
      setBusy(false)
    }
  }

  return { change, busy: busy || setAvatar.isPending }
}

function AvatarEditButton({
  name,
  src,
  onPress,
  busy,
}: {
  name: string
  src?: string | null
  onPress: () => void
  busy: boolean
}) {
  const t = useT()
  return (
    <View className="items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.change_avatar_label')}
        onPress={onPress}
        disabled={busy}
        className="active:opacity-80"
      >
        <Avatar name={name} src={src} size={88} />
        <View className="absolute right-0.5 bottom-0.5 h-[22px] w-[22px] items-center justify-center rounded-pill border-2 border-bg bg-accent-fill">
          <PlusIcon size={12} color="on-accent" />
        </View>
      </Pressable>
      {busy && <Caption className="mt-1 text-micro">…</Caption>}
    </View>
  )
}

// The user's own profile (Phase 6 mock E1): centered identity + avatar picker, a
// stats trio, edit/share, routes into the lists, and the two stat cards. The top
// bar (name + share + settings) is TopBar's profile variant. Ported from
// apps/app/src/screens/tabs/ProfileTab.tsx; the <input type=file> avatar becomes
// expo-image-picker + resizeToJpeg (square).
export default function ProfileTab() {
  const router = useRouter()
  const t = useT()
  const tabBarClearance = useTabBarClearance()
  const { data, isPending, isError, refetch } = useProfile(true)
  const p = data?.profile
  // Settings' own header card (M15) links straight into edit mode via
  // ?edit=1 — one less tap than landing here in view mode and hunting for
  // the "Editar perfil" button. Read once on mount; this screen's own
  // button still owns `editing` after that.
  const { edit: editParam } = useLocalSearchParams<{ edit?: string }>()
  const [editing, setEditing] = useState(editParam === '1')
  const avatarPicker = useAvatarPicker()

  const stats = useQuery({ queryKey: ['me-stats'], queryFn: () => api.get<MeStats>('/me/stats') })
  // Same key/endpoint as the Rankings tab, so it's usually already cached.
  const rankings = useQuery({
    queryKey: ['rankings'],
    queryFn: () => api.get<{ rankings: Ranking[] }>('/rankings'),
  })
  const top3 = [...(rankings.data?.rankings ?? [])]
    .sort((a, b) => a.position - b.position)
    .slice(0, 3)
  // Same ['plans'] cache key plans/index.tsx reads — the pending-invite
  // count here and the app's own list never disagree, and a visit to either
  // screen warms the other's cache.
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<{ plans: Plan[] }>('/plans'),
  })
  const pendingPlans = (plans.data?.plans ?? []).filter(isPendingInvite).length

  // Called before the `editing` branch below so the hook itself is always
  // registered (rules of hooks) — while actually editing, viewScrollRef is
  // unmounted, so the scroll call is a harmless no-op and only the
  // background refetch fires. No RefreshControl exists on this screen
  // today, so unlike discover.tsx/explore's onRefresh reuse, this is a
  // silent refetch — same posture as rankings.tsx's Saved/Barrios tabs.
  const viewScrollRef = useRef<ScrollView>(null)
  useResetOnTabPress(
    useCallback(() => {
      viewScrollRef.current?.scrollTo({ y: 0, animated: true })
      stats.refetch()
      rankings.refetch()
    }, [stats, rankings]),
  )

  if (editing) {
    return <EditProfile onClose={() => setEditing(false)} />
  }

  // A failed `/me` used to fall through to the render below with `p`
  // undefined — every field blanks or falls back to "Tú", indistinguishable
  // from a genuinely new, empty account. Skeleton while loading (this
  // screen's geometry is known ahead of time, same reasoning as the passport
  // screens); a real error state instead of a silently broken-looking profile.
  if (isPending) {
    return (
      <View className="flex-1 bg-bg">
        <TopBar variant="profile" title={t('common.you')} />
        <View className="items-center gap-3 pt-8">
          <Skeleton height={88} width={88} />
          <Skeleton height={14} width={140} />
          <Skeleton height={11} width={180} />
        </View>
      </View>
    )
  }
  if (isError) {
    return (
      <View className="flex-1 bg-bg">
        <TopBar variant="profile" title={t('common.you')} />
        <ErrorState onRetry={() => refetch()}>{t('profile.load_error')}</ErrorState>
      </View>
    )
  }

  const memberSince =
    p?.createdAt &&
    new Date(p.createdAt).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })
  const neighborhood = p?.neighborhood?.name

  // One editorial line from the taste stats the API already computes — a read on
  // how you eat, not another number. Elliptical "comida <cuisine>", so the
  // feminine cuisine label reads naturally, and all three null shapes hold.
  const topCuisine = stats.data?.topCuisine
    ? cuisineLabel(stats.data.topCuisine)?.toLowerCase()
    : null
  const topHood = stats.data?.topNeighborhood
  const tasteLine =
    topCuisine && topHood
      ? t('profile.taste_both', { cuisine: topCuisine, hood: topHood })
      : topCuisine
        ? t('profile.taste_cuisine_only', { cuisine: topCuisine })
        : topHood
          ? t('profile.taste_hood_only', { hood: topHood })
          : null

  return (
    <View className="flex-1 bg-bg">
      <TopBar variant="profile" title={p?.name || t('common.you')} shareHandle={p?.handle} />
      <ScrollView
        ref={viewScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
      >
        <View className="items-center pt-2">
          {/* Tapping the avatar opens the camera/library chooser directly —
              "Editar perfil" below opens the full screen for everything else
              (name, handle, sector, bio), which shows the same photo control
              at its top. */}
          <AvatarEditButton
            name={p?.name || p?.handle || 'm'}
            src={p?.image}
            onPress={avatarPicker.change}
            busy={avatarPicker.busy}
          />
          {p?.handle ? <Text className="mt-2 text-label text-text-2">@{p.handle}</Text> : null}
          <Caption className="mt-1">
            {[memberSince && t('profile.member_since', { date: memberSince }), neighborhood]
              .filter(Boolean)
              .join(' · ')}
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
            with the other achievement number, so it lives in the card only.
            Rendered with — placeholders while `stats` is still loading (instead
            of only once it lands) so the trio reserves its space rather than
            the whole header shifting down; hidden only on a genuine error. */}
        {/* Stats in one white card on the cream ground (founder's mock) —
            ranked · followers · following · streak, hairline-divided.
            Rendered with — placeholders while loading so it reserves its
            space; hidden only on a genuine error. */}
        {!stats.isError && (
          <View className="mt-5 flex-row rounded-card border border-line bg-surface py-2">
            {[
              {
                n: stats.data ? String(stats.data.places) : '—',
                l: t('profile.ranked'),
                go: () => router.push('/rankings'),
              },
              {
                n: stats.data ? String(stats.data.followers) : '—',
                l: t('profile.followers'),
                go: () => router.push(`/people/${p?.id}?tab=followers`),
              },
              {
                n: stats.data ? String(stats.data.following) : '—',
                l: t('profile.following'),
                go: () => router.push(`/people/${p?.id}?tab=following`),
              },
              {
                n: stats.data && stats.data.streakWeeks > 0 ? String(stats.data.streakWeeks) : '—',
                l: t('profile.streak_short'),
                go: () => router.push('/leaderboard'),
              },
            ].map((s, i) => (
              <View key={s.l} className={`flex-1 ${i > 0 ? 'border-line border-l' : ''}`}>
                <Stat n={s.n} l={s.l} onPress={s.go} />
              </View>
            ))}
          </View>
        )}

        {/* Share lives in TopBar only now — it used to also duplicate here,
            same handler, two entry points for one action. */}
        <View className="mt-4 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            className="min-h-[48px] flex-1 items-center justify-center rounded-pill bg-bg-sunk active:opacity-70"
          >
            <Text className="font-ui-semibold text-label text-accent-strong">
              {t('profile.edit_profile')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/friends')}
            className="min-h-[48px] flex-1 items-center justify-center rounded-pill bg-bg-sunk active:opacity-70"
          >
            <Text className="font-ui-semibold text-label text-accent-strong">
              {t('friends.title')}
            </Text>
          </Pressable>
        </View>

        {/* Tu top 3 — the first three of your list, as white cards. */}
        {top3.length > 0 ? (
          <View className="mt-6">
            <View className="mb-3 flex-row items-baseline justify-between">
              <Text className="font-ui-semibold text-subhead text-text">{t('profile.top3')}</Text>
              <Pressable
                onPress={() => router.push('/rankings')}
                hitSlop={8}
                className="active:opacity-60"
              >
                <Text className="font-ui-semibold text-label text-accent-strong">
                  {t('profile.see_your_list')} ›
                </Text>
              </Pressable>
            </View>
            <View className="gap-2">
              {top3.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/r/${r.restaurant.id}`)}
                  className="flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 active:opacity-80"
                >
                  <Text
                    style={[DATA_FIGURES, { width: 22 }]}
                    className="text-center font-serif text-serif-sm text-text"
                  >
                    {r.position}
                  </Text>
                  <PlaceCover
                    seed={r.restaurant.id}
                    name={r.restaurant.name}
                    coverImageId={r.restaurant.coverImageId}
                    size={{ w: 160, h: 160 }}
                    className="h-14 w-14 rounded-sm"
                  />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="font-ui-semibold text-subhead text-text">
                      {r.restaurant.name}
                    </Text>
                    <Caption numberOfLines={1}>
                      {[cuisineLabel(r.restaurant.cuisine), r.neighborhood]
                        .filter(Boolean)
                        .join(' · ')}
                    </Caption>
                  </View>
                  <Text style={DATA_FIGURES} className="font-serif text-serif-lg text-accent">
                    {displayScore(r.score)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View className="mt-6 overflow-hidden rounded-card border border-line bg-surface px-4">
          {/* No count here — the trio above already carries it. */}
          <NavRow
            icon={<CheckIcon size={15} />}
            label={t('profile.ranked')}
            onPress={() => router.push('/rankings')}
          />
          <NavRow
            icon={<BookmarkIcon size={15} />}
            label={t('rankings.saved_tab')}
            onPress={() => router.push('/rankings?tab=saved')}
          />
          {/* The member's named lists (M19) — they used to be a rail at the
              top of Guardados, which buried them inside the ranked passport.
              This is their one entry point now, a peer of "Tus platos". */}
          <NavRow
            icon={<ListIcon size={15} />}
            label={t('rankings.lists_section')}
            onPress={() => router.push('/collections')}
          />
          <NavRow
            icon={<ForkKnifeIcon size={15} />}
            label={t('dishLists.title')}
            onPress={() => router.push('/dish-lists')}
          />
          <NavRow
            icon={<CalendarIcon size={15} />}
            label={t('profile.plans')}
            meta={pendingPlans > 0 ? String(pendingPlans) : undefined}
            onPress={() => router.push('/plans')}
          />
          {/* Was "Recomendados para ti", which promised a personalized list this
              row never opened — it goes to Explore, whose default browse state
              is exactly that query. The label now says where it goes. */}
          <NavRow
            icon={<CompassIcon size={15} />}
            label={t('rankings.explore_spots')}
            onPress={() => router.push('/explore')}
            last
          />
        </View>

        {!stats.isError && (
          <View className="mt-4 flex-row gap-3">
            <StatCard
              label={t('profile.rank_in_dr')}
              value={
                stats.data ? (stats.data.rankInDr != null ? `#${stats.data.rankInDr}` : '—') : '—'
              }
              onPress={() => router.push('/leaderboard')}
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
  last,
}: {
  icon: ReactNode
  label: string
  meta?: string
  onPress: () => void
  last?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center justify-between py-4 active:opacity-70 ${last ? '' : 'border-line border-b'}`}
    >
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="font-ui text-body text-text">{label}</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {meta ? <Caption>{meta}</Caption> : null}
        <ChevronIcon size={16} color="text-faint" />
      </View>
    </Pressable>
  )
}

function StatCard({
  label,
  value,
  onPress,
}: {
  label: string
  value: string
  onPress?: () => void
}) {
  const body = (
    <>
      <Caption className="text-micro">{label}</Caption>
      <Text style={DATA_FIGURES} className="mt-1 font-serif text-serif-md text-accent">
        {value}
      </Text>
    </>
  )
  if (!onPress) {
    return <View className="flex-1 rounded border border-line bg-surface p-4">{body}</View>
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-1 rounded border border-line bg-surface p-4 active:opacity-70"
    >
      {body}
    </Pressable>
  )
}

// The one place that owns the whole profile — name, @handle, sector, bio AND
// the photo, which used to be a separate direct-avatar-tap flow on the main
// screen instead of living here. PATCH /me/profile for the fields, PATCH
// /me/avatar for the photo — two endpoints, one screen.
function EditProfile({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const t = useT()
  const { data } = useProfile(true)
  const p = data?.profile
  const [name, setName] = useState(p?.name ?? '')
  const [handle, setHandle] = useState(p?.handle ?? '')
  const [instagramHandle, setInstagramHandle] = useState(p?.instagramHandle ?? '')
  const [website, setWebsite] = useState(p?.website ?? '')
  const [bio, setBio] = useState(p?.bio ?? '')
  const [slug, setSlug] = useState('')
  const [cuisines, setCuisines] = useState<Set<string>>(new Set(p?.favoriteCuisines ?? []))
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(
    new Set((p?.favoriteNeighborhoods ?? []).map((n) => n.slug)),
  )
  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const currentSlug =
    slug ||
    neighborhoods.data?.neighborhoods.find((n) => n.name === p?.neighborhood?.name)?.slug ||
    ''
  const toggleCuisine = (c: string) =>
    setCuisines((cur) => {
      const next = new Set(cur)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  const toggleFavoriteSlug = (s: string) =>
    setFavoriteSlugs((cur) => {
      const next = new Set(cur)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  const save = useMutation({
    mutationFn: () =>
      api.patch('/me/profile', {
        name: name.trim(),
        handle: handle.trim().replace(/^@/, '') || undefined,
        neighborhoodSlug: currentSlug,
        bio: bio.trim() || undefined,
        instagramHandle: instagramHandle.trim(),
        website: website.trim(),
        favoriteCuisines: [...cuisines],
        favoriteNeighborhoodSlugs: [...favoriteSlugs],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      onClose()
    },
  })
  const canSave = name.trim().length > 0 && currentSlug.length > 0 && !save.isPending
  const avatarPicker = useAvatarPicker()

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
          <Text className="font-ui-medium text-label text-text-muted">
            {t('profile.edit_back')}
          </Text>
        </Pressable>

        <View className="mt-2 items-center">
          <AvatarEditButton
            name={p?.name || p?.handle || 'm'}
            src={p?.image}
            onPress={avatarPicker.change}
            busy={avatarPicker.busy}
          />
        </View>

        <View className="mt-6 gap-4">
          <Field
            label={t('onboarding.name_label')}
            value={name}
            onChangeText={setName}
            maxLength={60}
            textContentType="name"
            autoComplete="name"
          />
          <Field
            label={t('profile.username_label')}
            value={handle}
            onChangeText={setHandle}
            placeholder={t('profile.username_placeholder')}
            maxLength={30}
            // iOS capitalizes and autocorrects this by default — it's a handle.
            autoCapitalize="none"
            autoCorrect={false}
            error={save.error ? t('profile.handle_error') : undefined}
          />
          <Field
            label={t('profile.instagram_label')}
            value={instagramHandle}
            onChangeText={setInstagramHandle}
            placeholder={t('profile.instagram_placeholder')}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label={t('profile.website_label')}
            value={website}
            onChangeText={setWebsite}
            placeholder={t('profile.website_placeholder')}
            maxLength={200}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
          />
          <View>
            <Eyebrow className="mb-2">{t('rank.sector')}</Eyebrow>
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
          <View>
            <Eyebrow className="mb-2">{t('profile.favorite_neighborhoods_label')}</Eyebrow>
            <View className="flex-row flex-wrap gap-2">
              {neighborhoods.data?.neighborhoods.map((n) => (
                <Chip
                  key={n.slug}
                  size="sm"
                  state={favoriteSlugs.has(n.slug) ? 'selected' : 'default'}
                  onPress={() => toggleFavoriteSlug(n.slug)}
                >
                  {n.name}
                </Chip>
              ))}
            </View>
          </View>
          <View>
            <Eyebrow className="mb-2">{t('profile.favorite_cuisines_label')}</Eyebrow>
            <View className="flex-row flex-wrap gap-2">
              {ALL_CUISINES.map((c) => (
                <Chip
                  key={c}
                  size="sm"
                  state={cuisines.has(c) ? 'selected' : 'default'}
                  onPress={() => toggleCuisine(c)}
                >
                  {cuisineLabel(c)}
                </Chip>
              ))}
            </View>
          </View>
          <Field label={t('profile.bio_label')} value={bio} onChangeText={setBio} maxLength={160} />
        </View>

        <View className="mt-6">
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!canSave}
            onPress={() => save.mutate()}
          >
            {save.isPending ? t('common.saving') : t('rankings.save')}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}
