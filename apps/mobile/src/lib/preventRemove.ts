// expo-router doesn't re-export usePreventRemove from its public entry point,
// but it's the copy of the hook its OWN native-stack view actually reads
// (NativeStackView.native.js wires `preventNativeDismiss: isRemovePrevented`
// straight from this module's context) — importing from a separate
// `@react-navigation/native` install instead would talk to a different
// context and never suppress the native swipe/drag-to-dismiss. Isolated to
// this one file so an expo-router upgrade that moves it only needs one edit.
export { usePreventRemove } from 'expo-router/build/react-navigation/native'
