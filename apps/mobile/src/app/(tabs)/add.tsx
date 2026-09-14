import { View } from 'react-native'

// Inert placeholder. `_layout.tsx`'s "add" trigger is `disabled` — the native
// side blocks selection entirely, so this component is never mounted. It only
// exists because a NativeTabs.Trigger needs a matching route file. The real
// screen the trigger opens is app/rank.tsx, pushed imperatively from the
// trigger's `tabPress` listener.
export default function AddPlaceholder() {
  return <View className="flex-1 bg-bg" />
}
