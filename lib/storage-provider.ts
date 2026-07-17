/**
 * Storage provider dispatcher. Switch via STORAGE_PROVIDER env var:
 * - 'idrive' (default): iDrive e2 (S3-compatible)
 * - 'local': local filesystem on VPS (see lib/storage-local.ts)
 */
import * as idrive from './storage-idrive'
import * as local from './storage-local'

export type StorageProvider = 'idrive' | 'local'

export function getStorageProvider(): StorageProvider {
  return (process.env.STORAGE_PROVIDER || 'idrive').trim().toLowerCase() === 'local'
    ? 'local'
    : 'idrive'
}

function impl() {
  return getStorageProvider() === 'local' ? local : idrive
}

export function getPublicUrl(path: string): string {
  return impl().getPublicUrl(path)
}

export async function uploadBuffer(
  path: string,
  buffer: Buffer,
  contentType?: string
): Promise<{ url: string | null; error: string | null }> {
  return impl().uploadBuffer(path, buffer, contentType)
}

export async function getObjectBuffer(
  path: string
): Promise<{ buffer: Buffer; contentType?: string } | { error: string }> {
  return impl().getObjectBuffer(path)
}

export async function deleteObject(path: string): Promise<{ ok: boolean; error?: string }> {
  return impl().deleteObject(path)
}
