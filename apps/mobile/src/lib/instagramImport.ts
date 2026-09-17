// Parses Instagram's own "Descarga tu información" export (M18) — a zip or a
// single JSON file the member picks via File.pickFileAsync. Two known
// shapes, both containing the same `string_list_data` entries:
//   - followers_1.json (a bare array; a large account gets followers_2.json,
//     followers_3.json, … too — this app only asks for one file, so only
//     the first is ever read)
//   - following.json ({ relationships_following: [...] })
// Nothing here is uploaded — POST /social/instagram/match takes the parsed
// handles and stores nothing either (see that route's own header).

interface StringListEntry {
  href?: string
  value?: string
  title?: string
}
interface RawEntry {
  title?: string
  string_list_data?: StringListEntry[]
}

// value is the plain username in every export version seen; href is a
// fallback for a variant that omits it (the username is the trailing path
// segment of the profile URL); title is Instagram's own last resort on some
// exports where string_list_data itself is title-only.
function extractHandle(entry: StringListEntry): string | null {
  if (entry.value) return entry.value.trim().toLowerCase() || null
  if (entry.href) {
    const m = entry.href.match(/instagram\.com\/([^/?#]+)/i)
    if (m?.[1]) return m[1].trim().toLowerCase() || null
  }
  if (entry.title) return entry.title.trim().toLowerCase() || null
  return null
}

function extractFromRawEntries(entries: RawEntry[]): string[] {
  const handles = new Set<string>()
  for (const entry of entries) {
    const list = entry.string_list_data ?? []
    if (list.length === 0) {
      const handle = entry.title ? extractHandle({ title: entry.title }) : null
      if (handle) handles.add(handle)
      continue
    }
    for (const item of list) {
      const handle = extractHandle(item)
      if (handle) handles.add(handle)
    }
  }
  return [...handles]
}

// Parses one file's raw JSON text. Returns [] for anything unrecognized
// (wrong file, corrupted export, an unrelated JSON file) rather than
// throwing — a member picking the wrong file should see "no matches", not
// a crash.
export function parseInstagramJson(text: string): string[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  if (Array.isArray(data)) return extractFromRawEntries(data as RawEntry[])
  if (
    data &&
    typeof data === 'object' &&
    'relationships_following' in data &&
    Array.isArray((data as { relationships_following: unknown }).relationships_following)
  ) {
    return extractFromRawEntries(
      (data as { relationships_following: RawEntry[] }).relationships_following,
    )
  }
  return []
}

// Entry point for the picked file. A .json file is parsed directly; a .zip
// (the full "Descarga tu información" export) is unpacked in-memory with
// fflate (pure JS — no native module, so this needs no rebuild) looking for
// any followers_*.json / following.json wherever Instagram's folder layout
// happens to have put it in this export version.
export async function parseInstagramExport(bytes: Uint8Array, filename: string): Promise<string[]> {
  if (/\.json$/i.test(filename)) {
    return parseInstagramJson(new TextDecoder().decode(bytes))
  }
  const { unzipSync } = await import('fflate')
  const entries = unzipSync(bytes, {
    filter: (file) => /(^|\/)(followers(_\d+)?|following)\.json$/i.test(file.name),
  })
  const handles = new Set<string>()
  for (const content of Object.values(entries)) {
    for (const h of parseInstagramJson(new TextDecoder().decode(content))) handles.add(h)
  }
  return [...handles]
}
