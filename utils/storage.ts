import { createClient } from '@/utils/supabase/client'

const BUCKET_NAME = 'dtlabs'

export async function uploadFile(file: File, path: string): Promise<{ url: string | null; error: string | null }> {
  try {
    const supabase = createClient()
    
    // Upload file to storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Upload error:', error)
      return { url: null, error: error.message || 'Upload failed' }
    }

    if (!data) {
      return { url: null, error: 'No data returned from upload' }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path)

    return { url: urlData.publicUrl, error: null }
  } catch (error: unknown) {
    console.error('Failed to upload file:', error)
    return { url: null, error: error instanceof Error ? error.message : 'Failed to upload file' }
  }
}

export async function uploadAvatar(file: File, userId: string): Promise<{ url: string | null; error: string | null }> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}-${Date.now()}.${fileExt}`
  const filePath = `avatars/${fileName}`

  return await uploadFile(file, filePath)
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

/** Sanitize filename for storage path (keep extension, safe name). */
function sanitizeFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'file'
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return ext ? `${safe}.${ext}` : safe
}

export type TicketFileFolder = 'attachments' | 'comments'

/** Upload any file for ticket (description) or comment. Path: ticket/{ticketId}/{folder}/{unixtime}_{filename}. Returns url and path for DB. */
export async function uploadTicketFile(
  file: File,
  ticketId: string | number,
  folder: TicketFileFolder
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const id = String(ticketId)
  const unix = Math.floor(Date.now() / 1000)
  const safeName = sanitizeFileName(file.name)
  const filePath = `ticket/${id}/${folder}/${unix}_${safeName}`
  const result = await uploadFile(file, filePath)
  if (result.error || !result.url) return { url: null, path: null, error: result.error ?? null }
  return { url: result.url, path: filePath, error: null }
}

/** Upload file for ticket when ticket not yet created (draft). Path: ticket/draft/{folder}/{unixtime}_{filename}. */
export async function uploadTicketFileDraft(
  file: File,
  folder: TicketFileFolder
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const unix = Math.floor(Date.now() / 1000)
  const safeName = sanitizeFileName(file.name)
  const filePath = `ticket/draft/${folder}/${unix}_${safeName}`
  const result = await uploadFile(file, filePath)
  if (result.error || !result.url) return { url: null, path: null, error: result.error ?? null }
  return { url: result.url, path: filePath, error: null }
}

export async function deleteFile(path: string): Promise<boolean> {
  try {
    const supabase = createClient()
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path])

    if (error) {
      console.error('Delete error:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Failed to delete file:', error)
    return false
  }
}

export function getPublicUrl(path: string): string {
  const supabase = createClient()
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path)

  return data.publicUrl
}

