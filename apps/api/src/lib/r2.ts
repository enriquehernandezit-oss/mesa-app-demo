import { S3Client } from 'bun'

// Photo uploads via Cloudflare R2 (M23 — replaces the base64-in-Postgres path;
// Cloudinary was never actually wired). The phone uploads directly to R2 with a
// short-lived presigned PUT the API hands out — image bytes never pass through
// this server. Bun's built-in S3Client speaks R2's S3-compatible API directly,
// so this needs zero new dependencies.
//
// Env-gated like every other integration here: any of the five vars missing
// means uploads are dark (routes/uploads.ts answers 503), never a crash.

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET
// The bucket's public base URL (a pub-*.r2.dev subdomain, or a custom domain
// once one exists) — also read by imageRef.ts (upload validation), media.ts's
// counterpart on the client, and share-pages.ts (og:image).
export const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL

export function r2Enabled(): boolean {
  return Boolean(
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE_URL,
  )
}

let client: S3Client | null = null

function getClient(): S3Client {
  client ??= new S3Client({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  })
  return client
}

// One presigned PUT per call — the key is server-chosen (never trusts a
// client-supplied filename), scoped under the uploader's own id so a bucket
// listing (if one ever leaked) still reads as "whose photo", and a fresh
// UUID per upload so two uploads from the same person never collide.
// presign() is synchronous (it only signs a URL, no network call) despite
// looking like it should be awaited.
export function presignUpload(userId: string): { uploadUrl: string; publicUrl: string } {
  const key = `u/${userId}/${crypto.randomUUID()}.jpg`
  const uploadUrl = getClient().presign(key, {
    method: 'PUT',
    expiresIn: 300,
    type: 'image/jpeg',
  })
  return { uploadUrl, publicUrl: `${R2_PUBLIC_BASE_URL}/${key}` }
}
