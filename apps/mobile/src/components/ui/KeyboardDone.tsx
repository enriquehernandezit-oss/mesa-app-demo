import { InputAccessoryView, Keyboard, Platform, Pressable, Text, View } from 'react-native'

// A "Listo" bar above the keyboard for multiline inputs. Single-line fields get
// a return key that dismisses; a multiline field's return key inserts a newline,
// so without this the only way out of Mesa's note editors is tapping some other
// part of the screen — which on a short screen may be entirely covered.
//
// Pair by id: give the input `inputAccessoryViewID={id}` and render one of these
// with the same `id`. iOS-only (Android has its own dismissal affordances).
export function KeyboardDone({ id }: { id: string }) {
  if (Platform.OS !== 'ios') return null
  return (
    <InputAccessoryView nativeID={id}>
      <View className="flex-row justify-end border-line border-t bg-surface px-4 py-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => Keyboard.dismiss()}
          className="min-h-[36px] justify-center px-2 active:opacity-60"
        >
          <Text className="font-ui-semibold text-label text-accent-strong">Listo</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}
