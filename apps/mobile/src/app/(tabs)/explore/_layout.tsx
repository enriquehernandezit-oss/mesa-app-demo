import { Stack } from 'expo-router'

import { useT } from '@/lib/i18n'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'

// Explore gets its own stack so it owns a real UINavigationBar with a large title.
// The search field is Mesa's own Field at the top of the results list, not a native
// search bar. The map screen it pushes to keeps its own immersive presentation.
export default function ExploreLayout() {
  const t = useT()
  const theme = useResolvedTheme()
  const c = themeColors[theme]
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitle: true,
        title: t('tabs.explore'),
        headerTintColor: c.accent,
        headerStyle: { backgroundColor: c.bg },
        headerLargeStyle: { backgroundColor: c.bg },
        headerBlurEffect:
          theme === 'night'
            ? ('systemChromeMaterialDark' as const)
            : ('systemChromeMaterialLight' as const),
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'InstrumentSerif_400Regular', color: c.text },
        headerLargeTitleStyle: {
          fontFamily: 'InstrumentSerif_400Regular',
          fontSize: 40,
          color: c.text,
        },
        // Opaque, same reason as the root stack's contentStyle.
        contentStyle: { backgroundColor: c.bg },
        freezeOnBlur: true,
      }}
    />
  )
}
