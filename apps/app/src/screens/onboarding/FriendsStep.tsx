import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Body, Button, Caption, Title } from '../../components/ui'
import { api } from '../../lib/api'
import { contactsAvailable, importContactPhones } from '../../lib/contacts'
import type { SuggestedUser } from '../../lib/types'
import './friends.css'

// Step 3: friend-find, so a new profile is never friendless (the other half of
// the cold-start fix). Suggested people come from the API; contact import is
// offered only on a native build and asks permission just-in-time. Following is
// optimistic — tapping toggles immediately and the API call is idempotent.
export function FriendsStep({ onFinish }: { onFinish: () => void }) {
  const queryClient = useQueryClient()
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [matched, setMatched] = useState<SuggestedUser[] | null>(null)
  const [contactMsg, setContactMsg] = useState<string | null>(null)

  const suggested = useQuery({
    queryKey: ['onboarding', 'suggested-friends'],
    queryFn: () => api.get<{ users: SuggestedUser[] }>('/onboarding/suggested-friends'),
  })

  // Optimistic follow/unfollow. Both API calls are idempotent, so a rapid toggle
  // can't corrupt server state; we don't block the UI on them.
  function toggleFollow(userId: string) {
    setFollowing((cur) => {
      const next = new Set(cur)
      if (next.has(userId)) {
        next.delete(userId)
        void api.del(`/social/follow/${userId}`).catch(() => {})
      } else {
        next.add(userId)
        void api.post('/social/follow', { userId }).catch(() => {})
      }
      return next
    })
  }

  const contactMatch = useMutation({
    mutationFn: async () => {
      const result = await importContactPhones()
      if (result.status === 'unsupported') {
        setContactMsg('Contact import works on the phone app.')
        return
      }
      if (result.status === 'denied') {
        setContactMsg('No problem — you can add friends anytime from your profile.')
        return
      }
      const { users } = await api.post<{ users: SuggestedUser[] }>('/onboarding/contacts/match', {
        phoneNumbers: result.phoneNumbers,
      })
      setMatched(users)
      setContactMsg(
        users.length ? `${users.length} contacts are on Mesa.` : 'No contacts on Mesa yet.',
      )
    },
  })

  function done() {
    // Warm the graph-dependent caches before the tab shell reads them.
    queryClient.invalidateQueries({ queryKey: ['feed'] })
    onFinish()
  }

  const people = [...(matched ?? []), ...(suggested.data?.users ?? [])]
  // De-dupe if a contact match overlaps a suggestion.
  const seen = new Set<string>()
  const list = people.filter((u) => {
    if (seen.has(u.id)) return false
    seen.add(u.id)
    return true
  })
  const followedCount = following.size

  return (
    <div className="stack stack--loose" style={{ marginTop: 'var(--space-6)', flex: 1 }}>
      <div className="stack stack--tight">
        <Title>Follow a few friends</Title>
        <Body>Their rankings fill your feed. This is the whole point of Mesa.</Body>
      </div>

      {contactsAvailable() && (
        <Button
          variant="secondary"
          disabled={contactMatch.isPending}
          onClick={() => contactMatch.mutate()}
        >
          {contactMatch.isPending ? 'Checking…' : 'Find friends from contacts'}
        </Button>
      )}
      {contactMsg && <Caption>{contactMsg}</Caption>}

      <div className="friend-list">
        {suggested.isPending && <Body>Finding people…</Body>}
        {list.map((u) => {
          const on = following.has(u.id)
          return (
            <div key={u.id} className="friend-row">
              <div className="friend-row__id">
                <span className="friend-row__name">{u.name || u.handle}</span>
                <Caption>
                  {u.handle ? `@${u.handle}` : ''}
                  {u.neighborhood ? ` · ${u.neighborhood}` : ''}
                </Caption>
              </div>
              <button
                type="button"
                className={`friend-follow${on ? ' friend-follow--on' : ''}`}
                onClick={() => toggleFollow(u.id)}
              >
                {on ? 'Following' : 'Follow'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="spacer" />
      <Button onClick={done}>
        {followedCount > 0 ? `Done — following ${followedCount}` : 'Skip for now'}
      </Button>
    </div>
  )
}
