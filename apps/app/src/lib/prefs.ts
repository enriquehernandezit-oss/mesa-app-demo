// Client-only preferences (mock H1 "Your list" toggles). Stored in localStorage,
// like the theme choice — Mesa has no server-side preference store. `friendsOnly`
// hides the all-of-Mesa aggregate score so you only see your circle; `stealth` is
// a persisted-but-inert switch (no backend behaviour yet — it renders live).

const FRIENDS_ONLY_KEY = 'mesa.friends-only-scores'
const STEALTH_KEY = 'mesa.stealth-mode'

export function getFriendsOnlyScores(): boolean {
  return localStorage.getItem(FRIENDS_ONLY_KEY) === '1'
}
export function setFriendsOnlyScores(on: boolean): void {
  localStorage.setItem(FRIENDS_ONLY_KEY, on ? '1' : '0')
}

export function getStealthMode(): boolean {
  return localStorage.getItem(STEALTH_KEY) === '1'
}
export function setStealthMode(on: boolean): void {
  localStorage.setItem(STEALTH_KEY, on ? '1' : '0')
}
