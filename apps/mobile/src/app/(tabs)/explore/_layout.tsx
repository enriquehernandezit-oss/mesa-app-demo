import { useResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'
import { Stack } from 'expo-router'

// Explore gets its own stack purely so it can own a real UINavigationBar — that
// is what `headerSearchBarOptions` attaches to, and a search field pinned to the
// bar (focus, cancel, keyboard, scroll behavior all managed by UIKit) is the one
// piece of this screen a JS TextInput can only imitate. The map screen it pushes
// to keeps its own immersive presentation.
export default function ExploreLayout() {
  const theme = useResolvedTheme()
  const c = themeColors[theme]
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitle: true,
        title: 'Explora',
        headerTintColor: c.accent,
        headerStyle: { backgroundColor: c.bg },
        headerLargeStyle: { backgroundColor: c.bg },
        headerBlurEffect:
          theme === 'candlelit'
            ? ('systemChromeMaterialDark' as const)
            : ('systemChromeMaterialLight' as const),
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'CormorantGaramond_600SemiBold', color: c.text },
        headerLargeTitleStyle: { fontFamily: 'CormorantGaramond_600SemiBold', color: c.text },
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  )
}
