import * as SecureStore from 'expo-secure-store'

// One-time "how it works" coachmark for the pairwise compare step — the RN port
// of apps/app/src/lib/rankExplainer.ts, which used a localStorage watermark.
// Native has no localStorage, so the flag lives in SecureStore with a module
// cache: `seen()` is async (the caller shows the coach only after it resolves
// to false), `mark()` flips the cache and persists fire-and-forget.
const KEY = 'mesa.rank_explainer_seen'

let cached: boolean | null = null

export async function rankExplainerSeen(): Promise<boolean> {
  if (cached !== null) return cached
  try {
    cached = (await SecureStore.getItemAsync(KEY)) === '1'
  } catch {
    cached = false
  }
  return cached
}

export function markRankExplainerSeen(): void {
  cached = true
  void SecureStore.setItemAsync(KEY, '1').catch(() => {})
}
