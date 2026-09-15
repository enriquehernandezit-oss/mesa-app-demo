import { en } from '@/locales/en'
import { es } from '@/locales/es'
import * as SecureStore from 'expo-secure-store'
import { useSyncExternalStore } from 'react'

// EN/ES toggle (M4). Same module-store shape as lib/prefs.ts (SecureStore +
// useSyncExternalStore, so any screen reading the language re-renders the
// instant Settings flips it) — except the language has to be ready BEFORE the
// first frame, so initLanguage() is awaited in the root layout's splash gate
// next to initThemeChoice(), bounded the same way: a stuck native bridge costs
// one wrong-language frame, never a permanently blank app.

export type Lang = 'es' | 'en'

const KEY = 'mesa.language'
type Dict = Record<keyof typeof es, string | { one: string; other: string }>
const DICTS: Record<Lang, Dict> = { es, en }

function isLang(v: string | null): v is Lang {
  return v === 'es' || v === 'en'
}

// Device language decides the default for a member who has never chosen —
// `en` if the device is English, `es` otherwise. expo-localization isn't
// installed; Intl already knows the device locale without a native module.
function deviceDefault(): Lang {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale
    return locale.toLowerCase().startsWith('en') ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

let cachedLang: Lang = deviceDefault()
const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}

export async function initLanguage(): Promise<void> {
  try {
    const read = SecureStore.getItemAsync(KEY)
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 3000))
    const v = await Promise.race([read, timeout])
    if (isLang(v)) cachedLang = v
  } catch {
    // Keep the device-language guess.
  }
}

export function setLanguage(lang: Lang): void {
  cachedLang = lang
  emit()
  void SecureStore.setItemAsync(KEY, lang).catch(() => {})
}

export function getLanguage(): Lang {
  return cachedLang
}

export function useLanguage(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => cachedLang,
  )
}

// `dateLocale()` for toLocaleDateString/Intl.DateTimeFormat/localeCompare —
// the one other place a screen needs to know the language, distinct from a
// dictionary key.
export function dateLocale(lang: Lang = cachedLang): string {
  return lang === 'en' ? 'en-US' : 'es-DO'
}

type Vars = Record<string, string | number>

// Every dictionary value is either a plain string or a plural pair picked by
// `vars.n` (n === 1 -> one, else other) — the paired-key convention the M4
// plan calls for, so a screen never hand-rolls `amigo${n>1?'s':''}` again.
function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, k) => {
    const v = vars[k]
    return v == null ? m : String(v)
  })
}

export function t(lang: Lang, key: keyof typeof es, vars?: Vars): string {
  const entry = DICTS[lang][key]
  if (typeof entry === 'string') return interpolate(entry, vars)
  const n = typeof vars?.n === 'number' ? vars.n : 0
  return interpolate(n === 1 ? entry.one : entry.other, vars)
}

/** Bound to the current language; the component re-renders when it flips. */
export function useT(): (key: keyof typeof es, vars?: Vars) => string {
  const lang = useLanguage()
  return (key, vars) => t(lang, key, vars)
}
