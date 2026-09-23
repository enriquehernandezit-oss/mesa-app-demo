import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { FollowPill, PersonRow } from '@/components/PersonRow'
import {
  Body,
  Button,
  Caption,
  Card,
  ErrorState,
  RowsSkeleton,
  Title,
  Toggle,
} from '@/components/ui'
import { ChevronIcon, ShareIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { useInviteLink } from '@/hooks/useInviteLink'
import { useProfile } from '@/hooks/useProfile'
import { ApiError, api } from '@/lib/api'
import { importContactsWithNames } from '@/lib/contacts'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import type { ContactMatchUser, FriendSuggestion, SuggestionReason } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// Find friends (M18) — the v1 (M12.5) invite card + suggestions, now joined
// by contacts (opt-in "let them find you" + search-my-contacts) and an
// Instagram import. Reached from Profile, the empty feed, Settings and the
// followers screen.

function reasonLine(t: ReturnType<typeof useT>, reason: SuggestionReason): string {
  if (reason.kind === 'mutual')
    return t('friends.reason_mutual', { name: reason.name, n: reason.extraCount })
  if (reason.kind === 'taste') return t('friends.reason_taste', { n: reason.percent })
  return t('friends.reason_popular')
}

function ContactsCard() {
  const t = useT()
  const queryClient = useQueryClient()
  const me = useProfile(true)
  const placeholderColor = useColor('text-muted')
  const findable = me.data?.profile.phoneMatchEnabled ?? false

  const [editingPhone, setEditingPhone] = useState(false)
  const [phone, setPhone] = useState('')

  const savePhone = useMutation({
    mutationFn: () => api.put('/me/phone', { phone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setEditingPhone(false)
      setPhone('')
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : ''
      captureError(err, 'friends.savePhone')
      setContactMsg(
        code === 'invalid_phone'
          ? t('friends.contacts_phone_invalid')
          : t('friends.contacts_phone_error'),
      )
    },
  })
  const clearPhone = useMutation({
    mutationFn: () => api.del('/me/phone'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })

  const [searching, setSearching] = useState(false)
  const [contactMsg, setContactMsg] = useState<string | null>(null)
  const [matches, setMatches] = useState<{ user: ContactMatchUser; contactName: string }[] | null>(
    null,
  )

  async function searchContacts() {
    if (searching) return
    setSearching(true)
    setContactMsg(null)
    setMatches(null)
    try {
      const result = await importContactsWithNames()
      if (result.status === 'unsupported') {
        setContactMsg(t('friends.contacts_unsupported'))
        return
      }
      if (result.status === 'denied') {
        setContactMsg(t('friends.contacts_denied'))
        return
      }
      const nameByPhone = new Map<string, string>()
      const phones: string[] = []
      for (const contact of result.contacts) {
        for (const p of contact.phoneNumbers) {
          phones.push(p)
          if (!nameByPhone.has(p)) nameByPhone.set(p, contact.name)
        }
      }
      if (phones.length === 0) {
        setContactMsg(t('friends.contacts_none_found'))
        return
      }
      const { matches: found } = await api.post<{
        matches: (ContactMatchUser & { phone: string })[]
      }>('/social/contacts/match', { phones })
      setMatches(
        found.map((m) => ({
          user: { id: m.id, name: m.name, handle: m.handle, image: m.image },
          contactName: nameByPhone.get(m.phone) ?? '',
        })),
      )
      setContactMsg(
        found.length
          ? t('friends.contacts_found', { n: found.length })
          : t('friends.contacts_none_found'),
      )
    } catch (err) {
      captureError(err, 'friends.contactsSearch')
      setContactMsg(t('friends.contacts_search_error'))
    } finally {
      setSearching(false)
    }
  }

  return (
    <Card className="mt-4">
      <Text className="font-ui-semibold text-body text-text">{t('friends.contacts_title')}</Text>

      <View className="mt-3 flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-ui text-body text-text">
            {t('friends.contacts_findable_toggle')}
          </Text>
          <Caption className="mt-0.5">{t('friends.contacts_findable_body')}</Caption>
        </View>
        <Toggle
          checked={findable}
          onChange={(v) => {
            if (v) setEditingPhone(true)
            else clearPhone.mutate()
          }}
          label={t('friends.contacts_findable_toggle')}
        />
      </View>

      {editingPhone && !findable ? (
        <View className="mt-3 flex-row items-center gap-2">
          <TextInput
            className="min-h-[44px] flex-1 rounded border border-line bg-bg px-3 font-ui text-body text-text"
            placeholderTextColor={placeholderColor}
            placeholder={t('friends.contacts_phone_placeholder')}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Button
            size="sm"
            disabled={!phone.trim()}
            loading={savePhone.isPending}
            onPress={() => savePhone.mutate()}
          >
            {t('friends.contacts_phone_save')}
          </Button>
        </View>
      ) : null}

      <View className="mt-4 border-line border-t pt-4">
        <Button variant="secondary" disabled={searching} onPress={searchContacts}>
          {searching ? t('rank.searching') : t('friends.search_contacts')}
        </Button>
        {contactMsg ? <Caption className="mt-2">{contactMsg}</Caption> : null}
      </View>

      {matches && matches.length > 0 ? (
        <View className="mt-2">
          {/* Already inside the white Card — only the trailing hairline goes. */}
          {matches.map(({ user, contactName }, i) => (
            <PersonRow
              key={user.id}
              user={user}
              subtitle={t('friends.contact_match_subtitle', { name: contactName })}
              right={<FollowPill userId={user.id} initial={false} from="find_friends" />}
              last={i === matches.length - 1}
            />
          ))}
        </View>
      ) : null}
    </Card>
  )
}

function InstagramCard() {
  const t = useT()
  const router = useRouter()
  return (
    <Card className="mt-4">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/friends/instagram')}
        className="flex-row items-center gap-3 active:opacity-70"
      >
        <View className="min-w-0 flex-1">
          <Text className="font-ui-semibold text-body text-text">
            {t('friends.instagram_title')}
          </Text>
          <Caption className="mt-0.5">{t('friends.instagram_body')}</Caption>
        </View>
        <ChevronIcon size={16} color="text-faint" />
      </Pressable>
    </Card>
  )
}

export default function FriendsScreen() {
  const t = useT()
  const queryClient = useQueryClient()
  const invite = useInviteLink()
  const suggested = useQuery({
    queryKey: ['suggestions'],
    queryFn: () => api.get<{ users: FriendSuggestion[] }>('/social/suggestions'),
  })
  const users = suggested.data?.users ?? []
  // "Not interested" (M9) — one shared mutation for the whole list, same
  // reasoning as collections/[collectionId].tsx's removeItem: disables every
  // row's ✕ while ANY is mid-request rather than tracking per-row pending
  // state, so a fast double-tap can't fire two overlapping dismisses.
  const dismiss = useMutation({
    mutationFn: (userId: string) => api.post(`/social/suggestions/${userId}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suggestions'] }),
    onError: (err) => {
      captureError(err, 'friends.dismissSuggestion')
      toast({ variant: 'error', message: t('friends.dismiss_error') })
    },
  })

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-5 pb-10"
      contentInsetAdjustmentBehavior="automatic"
    >
      <Pressable
        accessibilityRole="button"
        onPress={invite.share}
        disabled={invite.sharing}
        className="mt-4 flex-row items-center gap-3 rounded border border-line bg-surface p-4 active:opacity-80"
      >
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-accent-fill">
          <ShareIcon size={18} color="on-accent" />
        </View>
        <View className="flex-1">
          <Text className="font-ui-semibold text-body text-text">{t('friends.invite_title')}</Text>
          <Caption className="mt-0.5">
            {invite.joined > 0
              ? t('settings.joined_count', { n: invite.joined })
              : t('friends.invite_body')}
          </Caption>
        </View>
      </Pressable>

      <ContactsCard />
      <InstagramCard />

      <Title className="mt-6 mb-1">{t('friends.suggestions_title')}</Title>
      {suggested.isPending ? (
        <RowsSkeleton rows={5} thumb={36} />
      ) : suggested.isError ? (
        <ErrorState onRetry={() => suggested.refetch()}>{t('friends.load_error')}</ErrorState>
      ) : users.length === 0 ? (
        <Body>{t('friends.no_suggestions')}</Body>
      ) : (
        <View className="overflow-hidden rounded-card border border-line bg-surface px-3">
          {users.map((u, i) => (
            <PersonRow
              key={u.id}
              user={u}
              subtitle={reasonLine(t, u.reason)}
              right={
                <View className="flex-row items-center gap-2">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('friends.not_interested_label')}
                    accessibilityState={{ disabled: dismiss.isPending }}
                    hitSlop={10}
                    onPress={() => {
                      if (!dismiss.isPending) dismiss.mutate(u.id)
                    }}
                    className="min-h-[32px] min-w-[32px] items-center justify-center"
                  >
                    <Text className="font-ui text-body text-text-muted">✕</Text>
                  </Pressable>
                  <FollowPill userId={u.id} initial={false} from="find_friends" />
                </View>
              }
              last={i === users.length - 1}
            />
          ))}
        </View>
      )}
    </ScrollView>
  )
}
