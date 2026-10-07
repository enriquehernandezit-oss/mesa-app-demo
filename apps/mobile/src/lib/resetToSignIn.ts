import type { useRouter } from 'expo-router'

type Router = ReturnType<typeof useRouter>

// Leaving an account (sign out, delete) clears every screen opened under it, then lands on sign-in.
// router.replace alone swapped only the top screen: the tabs and anything pushed under Settings stayed
// in the stack, so a swipe back after signing in to another account walked into the previous
// account's screens (and a fresh sign-in could land on the old Settings page).
export function resetToSignIn(router: Router) {
  if (router.canDismiss()) router.dismissAll()
  router.replace('/sign-in')
}
