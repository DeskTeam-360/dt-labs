import { eq } from 'drizzle-orm'

import { db, screenshots } from '@/lib/db'
import { deleteObject, getPublicUrl, uploadBuffer } from '@/lib/storage-idrive'
import { CaptureError,captureWebsite } from '@/lib/web-screenshot'

export type SavedCapture = { row: typeof screenshots.$inferSelect; unloadedImages: number }

/** Takes the picture of a page and keeps it with the other screenshots (file in storage plus a row). Throws CaptureError when it cannot. */
export async function captureAndSave(params: {
  userId: string
  url: string
  device: 'desktop' | 'mobile'
  fullPage: boolean
  waitSeconds?: number
  ticketId?: number | null
  /** Set for a picture taken for a crawl: it is tagged so the crawl can list it. */
  crawlSessionId?: string | null
}): Promise<SavedCapture> {
  const shot = await captureWebsite(params.url, { device: params.device, fullPage: params.fullPage, waitSeconds: params.waitSeconds })
  const host = new URL(shot.finalUrl).hostname.replace(/[^a-z0-9.-]/gi, '-')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = `screenshots/web-${host}-${params.device}-${stamp}.png`
  const { url: uploaded, error: uploadError } = await uploadBuffer(filePath, shot.png, 'image/png')
  if (uploadError) throw new CaptureError(uploadError, 500)

  const tags = ['web-capture', `device:${params.device}`]
  if (params.crawlSessionId) tags.push(`crawl:${params.crawlSessionId}`, `src:${params.url.slice(0, 500)}`)
  const [row] = await db
    .insert(screenshots)
    .values({
      userId: params.userId,
      fileName: filePath.split('/').pop() as string,
      filePath,
      fileUrl: uploaded ?? getPublicUrl(filePath),
      fileSize: shot.png.length,
      mimeType: 'image/png',
      ticketId: params.ticketId ?? null,
      title: shot.title.slice(0, 255),
      description: shot.finalUrl,
      tags,
    })
    .returning()
  return { row, unloadedImages: shot.unloadedImages }
}

/** Removes a picture made by a capture (the row and its file), so a bad one can be taken again. Only pictures tagged web-capture. */
export async function deleteWebCapture(id: string): Promise<'deleted' | 'not_found' | 'not_a_capture'> {
  const [row] = await db.select().from(screenshots).where(eq(screenshots.id, id)).limit(1)
  if (!row) return 'not_found'
  if (!(row.tags ?? []).includes('web-capture')) return 'not_a_capture'
  await db.delete(screenshots).where(eq(screenshots.id, id))
  await deleteObject(row.filePath).catch(() => undefined)
  return 'deleted'
}
