import { Stack } from 'expo-router'

import { useT } from '@/lib/i18n'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'

// Explore gets its own stack (the tab's own back history). Its title is drawn by the page itself,
// not a navigation bar: tapping the search has to slide the field to the top with the title scrolling
// away, and iOS folds a large title only under a finger — hiding the bar instead made the list jump
// twice. The Feed draws its top the same way.
export default function ExploreLayout() {
  const t = useT()
  const theme = useResolvedTheme()
  const c = themeColors[theme]
  return (
    <Stack
      screenOptions={{
        headerShown: false,
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
