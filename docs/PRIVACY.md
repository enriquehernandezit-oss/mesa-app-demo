# Private accounts and follow requests (F1)

Mesa is open by default: anyone can look at anyone's list, and following is instant. A member can
switch their account to **private** (Settings → Privacy). This file is the rulebook; the code is in
`apps/api/src/routes/social.ts` (requests), `lib/visibility.ts` (`canSeeContent`, `authorVisibleTo`)
and the gates listed below.

## The model

- `user.is_private` — the switch. Off for everyone.
- `follows` — approved following, exactly as before. **Every** existing read treats a row here as
  "may see their content" (the feed, friends' notes on a place, plan invites, the leaderboard's
  friends scope), so nothing pending is ever stored here.
- `follow_requests (requester_id, target_id)` — a pending request to follow a private account.
  Accepting moves the pair into `follows`; declining, cancelling, or a block just deletes it.

## Flow

| Who    | Does                                            | Result                                                                                                                       |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Anyone | taps **Follow** on an open account              | follows at once (`status: 'following'`)                                                                                      |
| Anyone | taps **Follow** on a private account            | a request (`status: 'requested'`); the owner gets a `follow_request` notification (push throttled to one per asker per hour) |
| Asker  | taps **Requested**                              | cancels: the request and its notification are deleted                                                                        |
| Owner  | opens Activity → **Follow requests**            | `GET /social/requests`: who asked, newest first                                                                              |
| Owner  | **Accept** (`POST /social/requests/:id/accept`) | asker becomes a follower; asker gets `follow_accepted`. They can then be followed back from the same list                    |
| Owner  | **Delete** (`.../decline`)                      | request gone; the asker is not told                                                                                          |
| Owner  | turns the account **public**                    | every pending request is approved and those people are told                                                                  |
| Owner  | turns the account **private**                   | people already following stay following                                                                                      |
| Either | blocks the other                                | any pending request goes with the follow edge                                                                                |

A request is in the owner's **bell count** (its `follow_request` notification is unread) but is **not a
row in the inbox list**: it lives behind the pinned "Follow requests" row.

## What someone can see before and after approval

|                                                                                      | Not following / requested             | Approved follower | The owner |
| ------------------------------------------------------------------------------------ | ------------------------------------- | ----------------- | --------- |
| Name, photo, @handle, neighborhood                                                   | yes                                   | yes               | yes       |
| Ranked / followers / following **counts**                                            | yes                                   | yes               | yes       |
| Their list, notes, top 3                                                             | **no** ("Follow to see their list")   | yes               | yes       |
| Taste match and the pair page                                                        | **no**                                | yes               | —         |
| Their followers / following lists                                                    | **no**                                | yes               | yes       |
| Their dishes (even ones marked public)                                               | **no**                                | yes               | yes       |
| Their rankings in your feed, Popular's friend line, "friends going"                  | **no**                                | yes               | —         |
| The city leaderboard                                                                 | not listed                            | listed            | listed    |
| A public web page (`/p/u/:handle`, their lists, their notes quoted on `/p/spot/:id`) | **none** (404 / left out)             | —                 | —         |
| Their top spots on their invite page (`/p/i/:code`)                                  | left out (the invitation still works) | —                 | —         |

Anonymous **aggregates** still count private members' rankings (a place's average score, how many people
ranked it, Popular): nothing there says who.

## Where the gates are

`GET /rankings/user/:id` (returns `locked`, `followStatus`, `rankedCount`; the list and match only when
allowed) · `GET /rankings/user/:id/match` · `GET /social/followers|following` (`locked: true`) ·
`GET /dishes/:id` and the place's dish rail · `GET /leaderboard` and `citywideRank` (same population) ·
`/p/u`, `/p/collection`, `/p/dish-list`, `/p/spot` (note), `/p/i`.
The feed, home, Popular, events-going, plans and place friend notes already read `follows` only, so a
pending request cannot leak through them.

## In the app (F2)

- **Settings → Privacy → Private account:** the switch (`PATCH /me/privacy`). Turning it off with requests
  waiting asks first ("the N waiting requests are approved").
- **Follow pill** (`hooks/useFollow.ts`, three states — Follow / **Requested** / Following): on a private
  account a tap asks and the pill becomes Requested; tapping Requested withdraws it. A suggestion or search
  row doesn't know the account is private, so it waits for the server's answer instead of flashing "Following".
- **A private profile you don't follow** (`app/u/[userId].tsx`): name, @handle, neighborhood and the three
  counts, the Follow / Requested button, and in place of the list a lock card ("Follow {name} to see their
  list, notes and dishes" / "Your request is waiting for {name} to accept"). No taste match. The counts
  are not tappable, and the followers/following screen says the list is private.
- **Activity → pinned "Follow requests" row** (`components/activity/FollowRequestsRow.tsx`): the newest
  asker's face with the count, "Héctor and 1 other want to follow you", a chevron into
  `app/follow-requests.tsx`: **Confirm** / **Delete** per person; a confirmed row stays and becomes
  **Follow back** (or Following/Requested) until you leave. Leaving the list or Activity marks the requests read.
- An unknown notification kind from a newer server is dropped by Activity (`isKnownKind`), never rendered blank.
