import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { Linking, ScrollView, Text, View } from 'react-native'

import { Group, NavRow, Row } from '@/components/SettingsRow'
import { Caption, MAX_SCALE, Wordmark } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { SUPPORT_EMAIL } from '@/lib/support'

// Acerca de (M15) — the three legal doc links, a way to write to support, plus the app's own version
// number, split out of the old flat app/settings.tsx. Redesign 2: the lowercase wordmark (the logo
// — never the app-icon M) over "Mesa 1.0.0", then one grouped card.
export default function AboutSettings() {
  const router = useRouter()
  const t = useT()
  const version = Constants.expoConfig?.version ?? '—'

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="items-center gap-1 pb-6 pt-5">
          <Wordmark size={64} />
          <Caption>Mesa {version}</Caption>
        </View>
        <Group>
          <NavRow
            label={t('settings.privacy_policy')}
            onPress={() => router.push('/legal/privacy')}
          />
          <NavRow label={t('settings.terms')} onPress={() => router.push('/legal/terms')} />
          <NavRow label={t('settings.eula')} onPress={() => router.push('/legal/eula')} />
          {/* The same address the legal text and the website give; opens the Mail app. */}
          <NavRow
            label={t('settings.contact_support')}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          />
          <Row last>
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="min-w-0 flex-1 font-ui text-body text-text"
            >
              {t('settings.app_version')}
            </Text>
            <Caption>{version}</Caption>
          </Row>
        </Group>
      </ScrollView>
    </View>
  )
}
