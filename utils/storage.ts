/**
 * Storage - iDrive e2 (S3-compatible)
 * Migrasi dari Supabase Storage
 *
 * Client: uses /api/upload
 * Server: uses lib/storage-idrive directly
 */

import {
  uploadBuffer,
  deleteObject,
  getPublicUrl as getIdrivePublicUrl,
} from '@/lib/storage-idrive'

const BUCKET_NAME = process.env.IDRIVE_E2_BUCKET || 'dtlabs'

async function uploadFileClient(file: File, path: string): Promise<{ url: string | null; error: string | null }> {
  const formData = new FormData()
  formData.set('file', file)
  formData.set('path', path)
  const res = await fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { url: null, error: data?.error || 'Upload failed' }
  return { url: data.url ?? null, error: null }
}

async function uploadFileServer(file: File, path: string): Promise<{ url: string | null; error: string | null }> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || 'application/octet-stream'
  return await uploadBuffer(path, buffer, contentType)
}

export async function uploadFile(
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const isClient = typeof window !== 'undefined'
    return isClient
      ? await uploadFileClient(file, path)
      : await uploadFileServer(file, path)
  } catch (error: unknown) {
    console.error('Failed to upload file:', error)
    return {
      url: null,
      error: error instanceof Error ? error.message : 'Failed to upload file',
    }
  }
}

export async function uploadAvatar(
  file: File,
  userId: string
): Promise<{ url: string | null; error: string | null }> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}-${Date.now()}.${fileExt}`
  const filePath = `avatars/${fileName}`
  return await uploadFile(file, filePath)
}

/** Sanitize filename for storage path (keep extension, safe name). */
function sanitizeFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'file'
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return ext ? `${safe}.${ext}` : safe
}

/** Sanitize company name for storage path. Tanpa company → non-company. */
function sanitizeCompanyName(name: string | undefined): string {
  const s = (name || '').trim()
  if (!s || s.toLowerCase() === 'unknown') return 'non-company'
  const safe = s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return safe || 'non-company'
}

export type TicketFileFolder = 'attachments' | 'comments'

/**
 * Upload file for ticket attachment or comment.
 * Path pattern: tickets/company_name/#ticket_id/{attachments|comments}/{timestamp}_{filename}
 */
export async function uploadTicketFile(
  file: File,
  ticketId: string | number,
  folder: TicketFileFolder,
  companyName: string | undefined
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const company = sanitizeCompanyName(companyName)
  const idPart = `#${ticketId}`
  const unix = Math.floor(Date.now() / 1000)
  const safeName = sanitizeFileName(file.name)
  const filePath = `tickets/${company}/${idPart}/${folder}/${unix}_${safeName}`
  const result = await uploadFile(file, filePath)
  if (result.error || !result.url)
    return { url: null, path: null, error: result.error ?? null }
  return { url: result.url, path: filePath, error: null }
}

/**
 * Upload file for ticket when ticket not yet created (draft).
 * Path pattern: tickets/company_name/draft/{attachments|comments}/{timestamp}_{filename}
 */
export async function uploadTicketFileDraft(
  file: File,
  folder: TicketFileFolder,
  companyName?: string
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const company = sanitizeCompanyName(companyName)
  const unix = Math.floor(Date.now() / 1000)
  const safeName = sanitizeFileName(file.name)
  const filePath = `tickets/${company}/draft/${folder}/${unix}_${safeName}`
  const result = await uploadFile(file, filePath)
  if (result.error || !result.url)
    return { url: null, path: null, error: result.error ?? null }
  return { url: result.url, path: filePath, error: null }
}

/** Upload image for ticket/comment. Path: ticket/{ticketId}/{unixtime}.{ext}. Use 'draft' when ticketId not provided. */
export async function uploadTicketImage(
  file: File,
  ticketId?: string | number
): Promise<{ url: string | null; error: string | null }> {
  const id = ticketId != null ? String(ticketId) : 'draft'
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const unix = Math.floor(Date.now() / 1000)
  const filePath = `ticket/${id}/${unix}.${ext}`
  return await uploadFile(file, filePath)
}

async function deleteFileClient(path: string): Promise<boolean> {
  const res = await fetch('/api/storage/delete', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  const data = await res.json().catch(() => ({}))
  return data?.success === true
}

export async function deleteFile(path: string): Promise<boolean> {
  try {
    const isClient = typeof window !== 'undefined'
    if (isClient) return await deleteFileClient(path)
    const result = await deleteObject(path)
    return result.ok
  } catch (error) {
    console.error('Failed to delete file:', error)
    return false
  }
}

export function getPublicUrl(path: string): string {
  return getIdrivePublicUrl(path)
}
