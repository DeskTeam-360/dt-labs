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
  } catch (error: any) {
    console.error('Failed to upload file:', error)
    return { url: null, error: error.message || 'Failed to upload file' }
  }
}

export async function uploadAvatar(file: File, userId: string): Promise<{ url: string | null; error: string | null }> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}-${Date.now()}.${fileExt}`
  const filePath = `avatars/${fileName}`

  return await uploadFile(file, filePath)
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

