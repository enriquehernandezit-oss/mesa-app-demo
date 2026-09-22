import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'

import { Row, RowButton } from '@/components/SettingsRow'
import { Caption } from '@/components/ui'
import { ChevronIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'

// Acerca de (M15) — the three legal doc links plus the app's own version
// number, split out of the old flat app/settings.tsx.
export default function AboutSettings() {
  const router = useRouter()
  const t = useT()
  const version = Constants.expoConfig?.version ?? '—'

  return (
    <View className="flex-1 bg-bg px-5 pt-4">
      <View className="rounded border border-line bg-surface px-4">
        <RowButton onPress={() => router.push('/legal/privacy')}>
          <Text className="flex-1 font-ui text-body text-text">{t('settings.privacy_policy')}</Text>
          <ChevronIcon size={16} color="text-faint" />
        </RowButton>
        <RowButton onPress={() => router.push('/legal/terms')}>
          <Text className="flex-1 font-ui text-body text-text">{t('settings.terms')}</Text>
          <ChevronIcon size={16} color="text-faint" />
        </RowButton>
        <RowButton onPress={() => router.push('/legal/eula')}>
          <Text className="flex-1 font-ui text-body text-text">{t('settings.eula')}</Text>
          <ChevronIcon size={16} color="text-faint" />
        </RowButton>
        <Row last>
          <Text className="flex-1 font-ui text-body text-text">{t('settings.app_version')}</Text>
          <Caption>{version}</Caption>
        </Row>
      </View>
    </View>
  )
}
