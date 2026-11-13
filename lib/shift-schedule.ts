import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm'

import { db, shiftSchedules, users } from '@/lib/db'

/** Today as a WIB calendar day, "YYYY-MM-DD". */
export function todayWib(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10)
}

/**
 * Moves people onto the shift of the period that is running now. A period is applied once, when it is found running
 * (called whenever shifts or users are read, when a period is created, and by the optional cron). People stay on their shift
 * after a period ends until the next period covering them starts. Cheap when nothing is due (one small query).
 */
export async function applyDueShiftSchedules(): Promise<number> {
  try {
    return await applyDue()
  } catch (e) {
    // Never break the screen that asked (for example before migration 097 has been run).
    console.error('[shift-schedule] apply failed:', e)
    return 0
  }
}

async function applyDue(): Promise<number> {
  const today = todayWib()
  const due = await db
    .select()
    .from(shiftSchedules)
    .where(and(isNull(shiftSchedules.appliedAt), lte(shiftSchedules.startDate, today), gte(shiftSchedules.endDate, today)))
    .orderBy(asc(shiftSchedules.startDate))
  if (due.length === 0) return 0

  // The period that started last wins for a person.
  const shiftOfUser = new Map<string, string>()
  for (const r of due) shiftOfUser.set(r.userId, r.shiftId)
  const usersOfShift = new Map<string, string[]>()
  for (const [userId, shiftId] of shiftOfUser) usersOfShift.set(shiftId, [...(usersOfShift.get(shiftId) ?? []), userId])

  for (const [shiftId, ids] of usersOfShift) {
    for (const userId of ids) {
      await db.update(users).set({ shiftId, updatedAt: new Date() }).where(eq(users.id, userId))
    }
  }
  const now = new Date()
  for (const r of due) await db.update(shiftSchedules).set({ appliedAt: now }).where(eq(shiftSchedules.id, r.id))
  return shiftOfUser.size
}
