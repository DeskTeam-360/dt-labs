import { eq, type SQL, sql } from 'drizzle-orm'

import { isAdmin } from '@/lib/auth-utils'
import { db, teamMembers, tickets } from '@/lib/db'

/** Shared helpers for the /api/v1 endpoints. */

const YMD = /^\d{4}-\d{2}-\d{2}$/

export const isYmd = (v: string | null | undefined): v is string => !!v && YMD.test(v)

/** Today as a WIB calendar date. */
export const todayWib = (): string => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)

/** Start and end moments of a WIB calendar day range. */
export function wibRange(fromYmd: string, toYmd: string): { start: Date; end: Date } {
  return { start: new Date(`${fromYmd}T00:00:00+07:00`), end: new Date(`${toYmd}T23:59:59.999+07:00`) }
}

/** An instant written in WIB, e.g. 2026-11-10T08:15:00+07:00. */
export function toWibIso(d: Date | string | null | undefined): string | null {
  if (!d) return null
  const t = new Date(d).getTime()
  if (!Number.isFinite(t)) return null
  return new Date(t + 7 * 3600000).toISOString().replace('Z', '+07:00').replace(/\.\d{3}/, '')
}

/** The WIB calendar day (YYYY-MM-DD) an instant falls on. */
export function wibDay(d: Date | string): string {
  return new Date(new Date(d).getTime() + 7 * 3600000).toISOString().slice(0, 10)
}

/** Comma separated query value to a clean list. */
export function csv(v: string | null | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/** SQL list for IN (...). An empty list matches nothing. */
export function sqlList(values: string[] | number[]): SQL {
  return values.length ? sql.join(values.map((v) => sql`${v}`), sql`, `) : sql`NULL`
}

export const hours = (seconds: number): number => Math.round((seconds / 3600) * 100) / 100

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
}

/**
 * The same visibility as the ticket list: an admin sees all; others see tickets without a team,
 * tickets of public teams and tickets of their own teams. null = no limit.
 */
export async function ticketVisibility(me: { id: string; role: string }): Promise<SQL | null> {
  if (isAdmin(me.role)) return null
  const mine = (await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, me.id))).map((r) => r.teamId)
  const publicTeams = sql`(SELECT id FROM teams WHERE type = 'public')`
  return mine.length > 0
    ? sql`(${tickets.teamId} IS NULL OR ${tickets.teamId} IN ${publicTeams} OR ${tickets.teamId} IN (${sqlList(mine)}))`
    : sql`(${tickets.teamId} IS NULL OR ${tickets.teamId} IN ${publicTeams})`
}

/** The readable text of an HTML body (tickets and comments are written in a rich text editor). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
