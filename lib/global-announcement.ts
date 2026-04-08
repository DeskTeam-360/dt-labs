import { db, globalAnnouncement } from '@/lib/db'
import { eq } from 'drizzle-orm'

/** Primary key of the single configuration row (must match migration seed). */
export const GLOBAL_ANNOUNCEMENT_ROW_ID = 'a0000001-0000-4000-8000-000000000001'

export type GlobalAnnouncementRow = typeof globalAnnouncement.$inferSelect

export async function getGlobalAnnouncementRow(): Promise<GlobalAnnouncementRow | null> {
  const [row] = await db
    .select()
    .from(globalAnnouncement)
    .where(eq(globalAnnouncement.id, GLOBAL_ANNOUNCEMENT_ROW_ID))
    .limit(1)
  return row ?? null
}

/** Message shown in the banner when enabled, in window, and non-empty. */
export function resolveActiveAnnouncementMessage(row: GlobalAnnouncementRow | null, now = new Date()): string | null {
  if (!row?.isEnabled) return null
  const text = (row.message ?? '').trim()
  if (!text) return null
  const start = row.startsAt
  const end = row.endsAt
  if (!start || !end) return null
  if (now.getTime() < start.getTime() || now.getTime() > end.getTime()) return null
  return text
}
