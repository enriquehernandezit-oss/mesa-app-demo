import { View } from 'react-native'

// Inert placeholder. `_layout.tsx`'s NativeShell (not currently shipped —
// see NATIVE_TABS) needs a route file for its "add" trigger even though that
// trigger is `disabled` and never mounts this; CustomShell (shipped) excludes
// it from its own route list via `href: null` so it can't be reached that way
// either. The real screen either path opens is app/rank.tsx, pushed
// imperatively from a tap handler, not this route.
export default function AddPlaceholder() {
  return <View className="flex-1 bg-bg" />
}
