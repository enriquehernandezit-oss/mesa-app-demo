import { File, UploadTask, UploadType } from 'expo-file-system'

import { api } from '@/lib/api'

type PresignResponse =
  | { available: false }
  | { available: true; uploadUrl: string; publicUrl: string }

// Uploads a local file (already cropped/resized — see lib/photoEditor.ts) to R2 via a
// presigned PUT the API hands out (POST /uploads), and returns the resulting
// public URL — the same value every image field (dish photo, avatar,
// collection cover) now stores. Never throws: null means "couldn't upload,"
// which every caller treats as "continue without a photo," same as a
// cancelled picker.
//
// Two distinct failure points, both folded into one null: `available: false`
// when R2 isn't configured (lib/r2.ts on the API), and the PUT to R2 failing
// on its own (network, an expired 5-minute URL, a malformed local file). SDK
// 57's expo-file-system moved the old function-based `uploadAsync` to
// `expo-file-system/legacy`; this is the current File/UploadTask API.
export async function uploadImage(localUri: string): Promise<string | null> {
  const presign = await api.post<PresignResponse>('/uploads')
  if (!presign.available) return null

  const result = await new UploadTask(new File(localUri), presign.uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'Content-Type': 'image/jpeg' },
  })
    .uploadAsync()
    .catch(() => null)
  if (!result || result.status < 200 || result.status >= 300) return null

  return presign.publicUrl
}
