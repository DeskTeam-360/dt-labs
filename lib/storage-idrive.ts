/**
 * iDrive e2 Storage (S3-compatible)
 * Menggantikan Supabase Storage
 *
 * Env vars:
 * - IDRIVE_E2_ENDPOINT: https://xyz1.ch11.idrivee2-2.com
 * - IDRIVE_E2_ACCESS_KEY
 * - IDRIVE_E2_SECRET_KEY
 * - IDRIVE_E2_BUCKET: dtlabs
 * - IDRIVE_E2_PUBLIC_URL: (optional) Base URL untuk file public, e.g. https://dtlabs.xyz1.ch11.idrivee2-2.com
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'

const BUCKET = process.env.IDRIVE_E2_BUCKET || 'dtlabs'
const ENDPOINT = process.env.IDRIVE_E2_ENDPOINT
const ACCESS_KEY = process.env.IDRIVE_E2_ACCESS_KEY
const SECRET_KEY = process.env.IDRIVE_E2_SECRET_KEY
const PUBLIC_BASE =
  process.env.IDRIVE_E2_PUBLIC_URL ||
  (ENDPOINT
    ? `https://${BUCKET}.${ENDPOINT.replace(/^https?:\/\//, '')}`
    : null)

function getClient(): S3Client | null {
  if (!ENDPOINT || !ACCESS_KEY || !SECRET_KEY) {
    console.warn('[Storage] iDrive e2 credentials not configured')
    return null
  }
  return new S3Client({
    endpoint: ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
    forcePathStyle: true,
  })
}

/** Build public URL for a path. Encode # as %23 for valid URL. */
export function getPublicUrl(path: string): string {
  const encodedPath = path.replace(/#/g, '%23')
  if (PUBLIC_BASE) {
    return `${PUBLIC_BASE}/${encodedPath}`
  }
  if (ENDPOINT) {
    const host = ENDPOINT.replace(/^https?:\/\//, '')
    return `https://${BUCKET}.${host}/${encodedPath}`
  }
  return `/${encodedPath}`
}

/** Upload file buffer to iDrive e2 */
export async function uploadBuffer(
  path: string,
  buffer: Buffer,
  contentType?: string
): Promise<{ url: string | null; error: string | null }> {
  const client = getClient()
  if (!client) {
    return { url: null, error: 'Storage not configured' }
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: path,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
        ACL: 'public-read',
      })
    )
    return { url: getPublicUrl(path), error: null }
  } catch (e) {
    console.error('[Storage] Upload error:', e)
    const msg = e instanceof Error ? e.message : 'Upload failed'
    return { url: null, error: msg }
  }
}

/** Delete file from iDrive e2. path = object key (no leading slash, no bucket prefix). Returns { ok, error }. */
export async function deleteObject(
  path: string
): Promise<{ ok: boolean; error?: string }> {
  const client = getClient()
  if (!client) {
    return { ok: false, error: 'Storage not configured' }
  }
  const key = path.replace(/^\/+/, '')
  if (!key) return { ok: false, error: 'Empty key' }

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    )
    return { ok: true }
  } catch (e) {
    console.error('[Storage] Delete error:', e)
    const msg = e instanceof Error ? e.message : 'Delete failed'
    return { ok: false, error: msg }
  }
}
