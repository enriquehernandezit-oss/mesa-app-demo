// Client-only preference (mock H1 "Your list"). Stored in localStorage, like the
// theme choice — Mesa has no server-side preference store. `friendsOnly` hides
// the all-of-Mesa aggregate score so you only see your circle, which is purely a
// display filter and therefore honest to keep client-side.
//
// Stealth mode used to live here too as a persisted-but-inert switch. It was
// removed rather than kept: hiding your activity from others is a SERVER
// concern, so a localStorage flag could never deliver it, and the toggle
// implied a privacy guarantee the app did not honour. Settings now shows it as
// "Pronto" until the backend enforces it.

const FRIENDS_ONLY_KEY = 'mesa.friends-only-scores'

export function getFriendsOnlyScores(): boolean {
  return localStorage.getItem(FRIENDS_ONLY_KEY) === '1'
}
export function setFriendsOnlyScores(on: boolean): void {
  localStorage.setItem(FRIENDS_ONLY_KEY, on ? '1' : '0')
}
