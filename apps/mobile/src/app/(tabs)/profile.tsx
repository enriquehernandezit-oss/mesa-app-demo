import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { EventTicket, useNow } from '@/components/events/EventTicket'
import { MiniPodium } from '@/components/list/Podium'
import { useTabBarClearance } from '@/components/MesaTabBar'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { ProfileStats } from '@/components/profile/ProfileStats'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SectorPicker } from '@/components/SectorPicker'
import { Group, NavRow } from '@/components/SettingsRow'
import {
  Button,
  Caption,
  Chip,
  ErrorState,
  Eyebrow,
  MAX_SCALE,
  SectionHeader,
  Serif,
  Skeleton,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Field } from '@/components/ui/Field'
import {
  BookmarkIcon,
  CalendarIcon,
  AtIcon,
  CameraIcon,
  CheckIcon,
  ChevronIcon,
  CompassIcon,
  ForkKnifeIcon,
  ListIcon,
  UserPlusIcon,
  WebIcon,
} from '@/components/ui/icons'
import { showSheet } from '@/components/ui/Sheet'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { useResetOnTabPress } from '@/hooks/useResetOnTabPress'
import { ApiError, api } from '@/lib/api'
import { ALL_CUISINES, cuisineLabel, displayScore } from '@/lib/display'
import { captureError } from '@/lib/errors'
import { dateLocale, useLanguage, useT } from '@/lib/i18n'
import { openImagePicker } from '@/lib/image'
import { editPhoto } from '@/lib/photoEditor'
import { isPendingInvite } from '@/lib/plans'
import type { EventSummary, MeStats, Neighborhood, Plan, Ranking } from '@/lib/types'
import { uploadImage } from '@/lib/upload'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// Shared avatar-change pipeline: sheet (camera/library) → permission → launch
// → crop/rotate (lib/photoEditor.ts, circle preview) → upload. One
// implementation for both the main Profile screen and Editar perfil, so the
// two photo controls (previously: main-screen
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
      const result = await openImagePicker(source)
      if (result.status === 'denied') {
        toast({
          variant: 'error',
          message: t('profile.no_camera_access'),
          action: { label: t('profile.settings_action'), onClick: () => Linking.openSettings() },
        })
        return
      }
      if (result.status !== 'picked') return
      const edited = await editPhoto(result.asset.uri, {
        maxEdge: 192,
        quality: 0.8,
        shape: 'circle',
      })
      if (!edited) return
      const uploaded = await uploadImage(edited)
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

// The photo, with the camera chip that says it can be changed: tapping it opens the
// camera/library chooser directly. Shared by the profile and Edit profile.
function AvatarEditButton({
  name,
  src,
  onPress,
  busy,
  size = 92,
}: {
  name: string
  src?: string | null
  onPress: () => void
  busy: boolean
  size?: number
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
        <Avatar name={name} src={src} size={size} />
        <View className="absolute -right-0.5 bottom-0.5 h-[30px] w-[30px] items-center justify-center rounded-pill border-2 border-bg bg-ink">
          <CameraIcon size={15} color="on-ink" />
        </View>
      </Pressable>
      {busy && <Caption className="mt-1 text-micro">…</Caption>}
    </View>
  )
}

// The user's own profile (Redesign 2): the identity centred (photo with its camera chip, name in
// the serif, @handle · neighbourhood · since, one line on how you eat), a card of counts, Edit
// profile / Find friends, your top three as a mini podium, and an icon list into everything that
// is yours. Share and Settings are the round chips at the top (ProfileHeader), which grows a glass
// bar with your name once the page scrolls. Ported from apps/app/src/screens/tabs/ProfileTab.tsx;
// the <input type=file> avatar becomes expo-image-picker + lib/photoEditor.ts's crop/rotate.
// The same ticket card Explore shows, so its bookmark and "I'm going" work
// right here; the countdown keeps its own minute tick.
function ProfileEventTicket({ e, index }: { e: EventSummary; index: number }) {
  const now = useNow()
  return <EventTicket e={e} index={index} now={now} />
}

export default function ProfileTab() {
  const router = useRouter()
  const t = useT()
  const language = useLanguage()
  const insets = useSafeAreaInsets()
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
  // Upcoming events this member RSVP'd to. Same ['events','mine'] key
  // Explore's Eventos view reads, so the two never disagree and a visit to
  // either warms the other. Lived under Saved in Rankings until it moved out
  // — plans you've made aren't things you bookmarked.
  const goingEvents = useQuery({
    queryKey: ['events', 'mine'],
    queryFn: () => api.get<{ events: EventSummary[] }>('/events/mine'),
  })
  const going = (goingEvents.data?.events ?? []).slice(0, 3)
  // Same ['plans'] cache key plans/index.tsx reads — the pending-invite
  // count here and the app's own list never disagree, and a visit to either
  // screen warms the other's cache.
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<{ plans: Plan[] }>('/plans'),
  })
  const pendingPlans = (plans.data?.plans ?? []).filter(isPendingInvite).length

  // The scroll offset drives ProfileHeader's glass bar (native-driven, so it never touches JS).
  const scrollY = useRef(new Animated.Value(0)).current
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  )

  // Called before the `editing` branch below so the hook itself is always
  // registered (rules of hooks) — while actually editing, viewScrollRef is
  // unmounted, so the scroll call is a harmless no-op and only the
  // background refetch fires. No RefreshControl exists on this screen
  // today, so unlike discover.tsx/explore's onRefresh reuse, this is a
  // silent refetch — same posture as rankings.tsx's Saved/Barrios tabs.
  const viewScrollRef = useRef<ScrollView>(null)
  useResetOnTabPress(
    useCallback(
      (wasActive: boolean) => {
        // Pressing Profile while you are ALREADY on it starts over: out of the editor, at the top.
        if (wasActive) setEditing(false)
        viewScrollRef.current?.scrollTo({ y: 0, animated: true })
        stats.refetch()
        rankings.refetch()
      },
      [stats, rankings],
    ),
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
        <ProfileHeader name={t('common.you')} scrollY={scrollY} />
        <View className="items-center gap-3" style={{ paddingTop: insets.top + 44 }}>
          <Skeleton height={92} width={92} />
          <Skeleton height={14} width={140} />
          <Skeleton height={11} width={180} />
        </View>
      </View>
    )
  }
  if (isError) {
    return (
      <View className="flex-1 bg-bg">
        <ProfileHeader name={t('common.you')} scrollY={scrollY} />
        <View style={{ paddingTop: insets.top + 44 }}>
          <ErrorState onRetry={() => refetch()}>{t('profile.load_error')}</ErrorState>
        </View>
      </View>
    )
  }

  const memberSince =
    p?.createdAt &&
    new Date(p.createdAt).toLocaleDateString(dateLocale(), { month: 'short', year: 'numeric' })
  const neighborhood = p?.neighborhood?.name
  const identityLine = [
    p?.handle ? `@${p.handle}` : null,
    neighborhood,
    memberSince ? t('profile.member_since', { date: memberSince }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // One editorial line from the taste stats the API already computes — a read on
  // how you eat, not another number. In Spanish it is elliptical ("comida <cuisine>"), so the
  // cuisine goes lower-case there; English keeps its capital ("Italian"). All three null shapes hold.
  const cuisine = stats.data?.topCuisine ? cuisineLabel(stats.data.topCuisine) : null
  const topCuisine = cuisine && language === 'es' ? cuisine.toLowerCase() : cuisine
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
      <Animated.ScrollView
        ref={viewScrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 44, paddingBottom: tabBarClearance }}
      >
        <View className="items-center px-6">
          {/* Tapping the photo opens the camera/library chooser directly — "Edit profile"
              below opens the full screen for everything else (name, handle, sector, bio),
              which shows the same photo control at its top. */}
          <AvatarEditButton
            name={p?.name || p?.handle || 'm'}
            src={p?.image}
            onPress={avatarPicker.change}
            busy={avatarPicker.busy}
          />
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-3 text-center font-serif text-serif-lg text-text"
          >
            {p?.name || t('common.you')}
          </Text>
          {identityLine ? (
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-1.5 text-center font-ui text-label text-text-muted"
            >
              {identityLine}
            </Text>
          ) : null}
          {tasteLine ? (
            <Serif className="mt-2.5 text-center text-serif-sm text-text-2">{tasteLine}</Serif>
          ) : null}
        </View>

        {/* Rendered with — placeholders while `stats` is still loading (instead of only once it
            lands) so the card reserves its space rather than the page shifting down; hidden
            only on a genuine error. */}
        {!stats.isError && (
          <View className="mt-5">
            <ProfileStats
              items={[
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
                  n:
                    stats.data && stats.data.streakWeeks > 0 ? String(stats.data.streakWeeks) : '—',
                  l: t('profile.streak_short'),
                  go: () => router.push('/leaderboard'),
                },
              ]}
            />
          </View>
        )}

        <View className="mx-4 mt-3 flex-row gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px] flex-1"
            onPress={() => setEditing(true)}
          >
            {t('profile.edit_profile')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px] flex-1"
            icon={<UserPlusIcon size={17} />}
            onPress={() => router.push('/friends')}
          >
            {t('friends.title')}
          </Button>
        </View>

        {/* Your top three — the first of your list, as a mini podium. */}
        {top3.length > 0 ? (
          <View className="px-4">
            <View className="px-1">
              <SectionHeader
                action={
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/rankings')}
                    hitSlop={8}
                    className="flex-row items-center gap-1 active:opacity-60"
                  >
                    <Text
                      maxFontSizeMultiplier={MAX_SCALE}
                      className="font-ui-semibold text-label text-accent"
                    >
                      {t('profile.see_your_list')}
                    </Text>
                    <ChevronIcon size={13} color="accent" />
                  </Pressable>
                }
              >
                {t('profile.top3')}
              </SectionHeader>
            </View>
            <MiniPodium items={top3} />
          </View>
        ) : null}

        {/* What you've said you're going to — the events half of "my stuff", capped at three
            the way your top three is, with the full list a tap away in Explore. */}
        {going.length > 0 ? (
          <View className="px-4">
            <View className="px-1">
              <SectionHeader
                action={
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/explore')}
                    hitSlop={8}
                    className="flex-row items-center gap-1 active:opacity-60"
                  >
                    <Text
                      maxFontSizeMultiplier={MAX_SCALE}
                      className="font-ui-semibold text-label text-accent"
                    >
                      {t('profile.see_all_events')}
                    </Text>
                    <ChevronIcon size={13} color="accent" />
                  </Pressable>
                }
              >
                {t('events.going_section')}
              </SectionHeader>
            </View>
            {going.map((e, i) => (
              <ProfileEventTicket key={e.id} e={e} index={i} />
            ))}
          </View>
        ) : null}

        <View className="mt-4 px-4">
          <Group>
            {/* No count on Ranked — the card above already carries it. */}
            <NavRow
              icon={<CheckIcon size={18} />}
              label={t('profile.ranked')}
              onPress={() => router.push('/rankings')}
            />
            <NavRow
              icon={<BookmarkIcon size={18} />}
              label={t('rankings.saved_tab')}
              onPress={() => router.push('/rankings?tab=saved')}
            />
            {/* The member's named lists (M19) — their one entry point, a peer of "Your dishes". */}
            <NavRow
              icon={<ListIcon size={18} />}
              label={t('rankings.lists_section')}
              onPress={() => router.push('/collections')}
            />
            <NavRow
              icon={<ForkKnifeIcon size={18} />}
              label={t('dishLists.title')}
              onPress={() => router.push('/dish-lists')}
            />
            <NavRow
              icon={<CalendarIcon size={18} />}
              label={t('profile.plans')}
              meta={pendingPlans > 0 ? String(pendingPlans) : undefined}
              onPress={() => router.push('/plans')}
            />
            {/* Goes to Explore, whose default browse state is the recommendations query. */}
            <NavRow
              icon={<CompassIcon size={18} />}
              label={t('rankings.explore_spots')}
              onPress={() => router.push('/explore')}
              last
            />
          </Group>
        </View>

        {!stats.isError && stats.data ? (
          <View className="mx-4 mt-3 flex-row gap-2">
            <StatTile
              label={t('profile.rank_in_dr')}
              value={stats.data.rankInDr != null ? `#${stats.data.rankInDr}` : '—'}
              onPress={() => router.push('/leaderboard')}
            />
            {stats.data.avgScore != null ? (
              <StatTile label={t('profile.avg_score')} value={displayScore(stats.data.avgScore)} />
            ) : null}
          </View>
        ) : null}
      </Animated.ScrollView>

      <ProfileHeader name={p?.name || t('common.you')} handle={p?.handle} scrollY={scrollY} />
    </View>
  )
}

// A number that says where you stand (your rank in the country, your average) — a raised r22
// tile with the figure in the serif.
function StatTile({
  label,
  value,
  onPress,
}: {
  label: string
  value: string
  onPress?: () => void
}) {
  const lift = useLift()
  const body = (
    <>
      <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-meta text-text-muted">
        {label}
      </Text>
      <Text
        style={DATA_FIGURES}
        maxFontSizeMultiplier={MAX_SCALE}
        className="mt-1.5 font-serif text-serif-lg text-text"
      >
        {value}
      </Text>
    </>
  )
  const box = 'flex-1 rounded-group bg-surface px-4 py-3.5'
  if (!onPress) {
    return (
      <View className={box} style={lift}>
        {body}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`${box} active:opacity-70`}
      style={lift}
    >
      {body}
    </Pressable>
  )
}

// The one place that owns the whole profile — name, @handle, sector, bio AND
// the photo, which used to be a separate direct-avatar-tap flow on the main
// screen instead of living here. PATCH /me/profile for the fields, PATCH
// /me/avatar for the photo — two endpoints, one screen. Redesign 2: a back chip and title, the
// photo, labelled fields, pills for the choices, and one solid Save.
const MAX_FAVORITE_CUISINES = 10

function EditProfile({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const t = useT()
  const tabBarClearance = useTabBarClearance()
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
  // The server keeps up to 10 favourite cuisines; the screen offers 28 chips, and an 11th made the
  // whole save fail (400) with a message about the handle.
  const toggleCuisine = (c: string) =>
    setCuisines((cur) => {
      const next = new Set(cur)
      if (next.has(c)) next.delete(c)
      else if (next.size < MAX_FAVORITE_CUISINES) next.add(c)
      return next
    })

  // Opened before /me was cached (a `?edit=1` link, a cold start), the fields were seeded from nothing
  // and stayed empty once the profile arrived — saving then blanked the profile. Fill them once, when
  // the data first shows up, and never again (so typing is not overwritten by a refetch).
  const [hydrated, setHydrated] = useState(Boolean(p))
  useEffect(() => {
    if (!p || hydrated) return
    setName(p.name ?? '')
    setHandle(p.handle ?? '')
    setInstagramHandle(p.instagramHandle ?? '')
    setWebsite(p.website ?? '')
    setBio(p.bio ?? '')
    setCuisines(new Set(p.favoriteCuisines ?? []))
    setFavoriteSlugs(new Set((p.favoriteNeighborhoods ?? []).map((n) => n.slug)))
    setHydrated(true)
  }, [p, hydrated])
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
        // Only sent when it was changed: an older handle that no longer passes today's rules would
        // otherwise make every save fail, however little the member edited.
        handle:
          handle.trim().replace(/^@/, '') !== (p?.handle ?? '')
            ? handle.trim().replace(/^@/, '') || undefined
            : undefined,
        neighborhoodSlug: currentSlug,
        bio: bio.trim() || undefined,
        instagramHandle: instagramHandle.trim(),
        website: website.trim(),
        favoriteCuisines: [...cuisines],
        favoriteNeighborhoodSlugs: [...favoriteSlugs],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      // The name and photo are on every feed card and comment.
      for (const key of ['feed', 'comments', 'user-rankings']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      onClose()
    },
  })
  // What went wrong, in words that match: only a taken handle is about the handle.
  const saveError = !save.error
    ? undefined
    : save.error instanceof ApiError && save.error.code === 'handle_taken'
      ? t('profile.handle_error')
      : t('profile.save_error')
  const canSave = name.trim().length > 0 && currentSlug.length > 0 && !save.isPending
  const avatarPicker = useAvatarPicker()

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        onBack={onClose}
        backLabel={t('common.back_plain')}
        title={t('profile.edit_profile')}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <View className="mt-2 items-center">
          <AvatarEditButton
            size={84}
            name={p?.name || p?.handle || 'm'}
            src={p?.image}
            onPress={avatarPicker.change}
            busy={avatarPicker.busy}
          />
        </View>

        <View className="mt-5 gap-4 px-4">
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
            error={
              save.error instanceof ApiError && save.error.code === 'handle_taken'
                ? t('profile.handle_error')
                : undefined
            }
          />
          <Field
            label={t('profile.instagram_label')}
            icon={<AtIcon size={18} color="text-muted" />}
            value={instagramHandle}
            onChangeText={setInstagramHandle}
            placeholder={t('profile.instagram_placeholder')}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label={t('profile.website_label')}
            icon={<WebIcon size={18} color="text-muted" />}
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
            <SectorPicker
              sectors={neighborhoods.data?.neighborhoods ?? []}
              selected={new Set(currentSlug ? [currentSlug] : [])}
              onToggle={setSlug}
            />
          </View>
          <View>
            <Eyebrow className="mb-2">{t('profile.favorite_neighborhoods_label')}</Eyebrow>
            <SectorPicker
              sectors={neighborhoods.data?.neighborhoods ?? []}
              selected={favoriteSlugs}
              onToggle={toggleFavoriteSlug}
            />
          </View>
          <View>
            <Eyebrow className="mb-2">
              {t('profile.favorite_cuisines_label')} · {cuisines.size}/{MAX_FAVORITE_CUISINES}
            </Eyebrow>
            <View className="flex-row flex-wrap gap-2">
              {ALL_CUISINES.map((c) => (
                <Chip
                  key={c}
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
        {saveError && !(save.error instanceof ApiError && save.error.code === 'handle_taken') ? (
          <Caption className="mt-3 px-5 text-danger">{saveError}</Caption>
        ) : null}

        <View className="mt-6 px-4">
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
