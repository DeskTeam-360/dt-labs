import { and, eq, inArray } from 'drizzle-orm'
import { google } from 'googleapis'

import { calendarEvents, calendarGoogleLinks, db, googleCalendarConnections } from '@/lib/db'

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function googleCalendarRedirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  return `${base}/api/calendar/google/callback`
}

export function isGoogleCalendarConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

function oauthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleCalendarRedirectUri())
}

/** The person's Google Calendar client; the access token is renewed (and saved) when it has run out. */
async function clientFor(userId: string) {
  const [conn] = await db.select().from(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId)).limit(1)
  if (!conn?.accessToken) return null
  const auth = oauthClient()
  auth.setCredentials({
    access_token: conn.accessToken,
    refresh_token: conn.refreshToken ?? undefined,
    expiry_date: conn.expiresAt ? new Date(conn.expiresAt).getTime() : undefined,
  })
  auth.on('tokens', (t) => {
    void db
      .update(googleCalendarConnections)
      .set({
        accessToken: t.access_token ?? conn.accessToken,
        expiresAt: t.expiry_date ? new Date(t.expiry_date) : conn.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.userId, userId))
  })
  return { calendar: google.calendar({ version: 'v3', auth }), calendarId: conn.calendarId || 'primary' }
}

type EventRow = typeof calendarEvents.$inferSelect

const addDay = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)

/** All-day entry; the end date of a Google all-day event is exclusive. A yearly entry repeats every year. */
function toGoogleEvent(e: EventRow) {
  return {
    summary: e.title,
    description: [e.notes, 'From DeskTeam360 calendar'].filter(Boolean).join('\n\n'),
    start: { date: e.startDate },
    end: { date: addDay(e.endDate) },
    recurrence: e.repeatYearly ? ['RRULE:FREQ=YEARLY'] : undefined,
    transparency: e.type === 'leave' ? 'opaque' : 'transparent',
    extendedProperties: { private: { deskteam360EventId: e.id } },
  }
}

const statusOf = (err: unknown): number | undefined => (err as { code?: number; response?: { status?: number } })?.code ?? (err as { response?: { status?: number } })?.response?.status

export type PushResult = { created: number; updated: number; failed: Array<{ id: string; title: string; error: string }> }

/** Sends the entries to the person's own Google Calendar: new ones are created, ones sent before are updated. */
export async function pushEventsForUser(userId: string, eventIds: string[]): Promise<PushResult | { error: string }> {
  const c = await clientFor(userId)
  if (!c) return { error: 'Google Calendar is not connected' }
  const events = eventIds.length ? await db.select().from(calendarEvents).where(inArray(calendarEvents.id, eventIds)) : []
  const links = events.length
    ? await db.select().from(calendarGoogleLinks).where(and(eq(calendarGoogleLinks.userId, userId), inArray(calendarGoogleLinks.eventId, events.map((e) => e.id))))
    : []
  const linkOf = new Map(links.map((l) => [l.eventId, l.googleEventId]))

  const result: PushResult = { created: 0, updated: 0, failed: [] }
  for (const e of events) {
    try {
      const body = toGoogleEvent(e)
      const existing = linkOf.get(e.id)
      let googleId = existing
      let updated = false
      if (existing) {
        try {
          await c.calendar.events.update({ calendarId: c.calendarId, eventId: existing, requestBody: body })
          updated = true
        } catch (err) {
          // Deleted by hand in Google: create it again.
          if (statusOf(err) !== 404 && statusOf(err) !== 410) throw err
          googleId = undefined
        }
      }
      if (!googleId) {
        const res = await c.calendar.events.insert({ calendarId: c.calendarId, requestBody: body })
        googleId = res.data.id ?? undefined
      }
      if (!googleId) throw new Error('Google did not return an event id')
      await db
        .insert(calendarGoogleLinks)
        .values({ eventId: e.id, userId, googleEventId: googleId })
        .onConflictDoUpdate({ target: [calendarGoogleLinks.eventId, calendarGoogleLinks.userId], set: { googleEventId: googleId, syncedAt: new Date() } })
      if (updated) result.updated++
      else result.created++
    } catch (err) {
      result.failed.push({ id: e.id, title: e.title, error: err instanceof Error ? err.message : 'Failed' })
    }
  }
  return result
}

/** An entry was edited: every Google Calendar it was sent to gets the new version. Best effort. */
export async function syncLinkedGoogleEvents(eventId: string): Promise<void> {
  const [e] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId)).limit(1)
  if (!e) return
  const links = await db.select().from(calendarGoogleLinks).where(eq(calendarGoogleLinks.eventId, eventId))
  for (const l of links) {
    try {
      const c = await clientFor(l.userId)
      if (!c) continue
      await c.calendar.events.update({ calendarId: c.calendarId, eventId: l.googleEventId, requestBody: toGoogleEvent(e) })
    } catch (err) {
      console.error(`[google-calendar] Could not update ${l.googleEventId} for ${l.userId}:`, err)
    }
  }
}

/** An entry is about to be deleted: remove it from every Google Calendar it was sent to. Best effort. */
export async function removeLinkedGoogleEvents(eventId: string): Promise<void> {
  const links = await db.select().from(calendarGoogleLinks).where(eq(calendarGoogleLinks.eventId, eventId))
  for (const l of links) {
    try {
      const c = await clientFor(l.userId)
      if (!c) continue
      await c.calendar.events.delete({ calendarId: c.calendarId, eventId: l.googleEventId })
    } catch (err) {
      if (statusOf(err) === 404 || statusOf(err) === 410) continue
      console.error(`[google-calendar] Could not delete ${l.googleEventId} for ${l.userId}:`, err)
    }
  }
}

/** Disconnecting forgets the account and the links; events already in Google stay there. */
export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const [conn] = await db.select().from(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId)).limit(1)
  if (conn?.refreshToken || conn?.accessToken) {
    try {
      await oauthClient().revokeToken((conn.refreshToken || conn.accessToken)!)
    } catch {
      // The token may already be revoked.
    }
  }
  await db.delete(calendarGoogleLinks).where(eq(calendarGoogleLinks.userId, userId))
  await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId))
}

export { oauthClient as googleOAuthClient }
