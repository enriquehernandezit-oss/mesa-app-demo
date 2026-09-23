import { getLanguage, t } from '@/lib/i18n'

import { apiOrigin } from './api'

// Public share links for the app's three list concepts (M8) — each routed to
// its own page in apps/api/src/routes/share-pages.ts. Mirrors
// shareProfile.ts's link-builder + text-builder pair (not a side-effecting
// wrapper around shareListCard: the three call sites already build their own
// request the way rankings.tsx's shareList() does, this just gives them the
// link and the caption to put in it).

export function curatedListShareLink(slug: string): string {
  return `${apiOrigin}/p/list/${slug}`
}
export function curatedListShareText(title: string, slug: string): string {
  return t(getLanguage(), 'share.curated_list_text', { title, link: curatedListShareLink(slug) })
}

export function collectionShareLink(id: string): string {
  return `${apiOrigin}/p/collection/${id}`
}
export function collectionShareText(name: string, id: string): string {
  return t(getLanguage(), 'share.collection_text', { name, link: collectionShareLink(id) })
}

export function dishListShareLink(id: string): string {
  return `${apiOrigin}/p/dish-list/${id}`
}
export function dishListShareText(label: string, id: string): string {
  return t(getLanguage(), 'share.dish_list_text', { label, link: dishListShareLink(id) })
}
