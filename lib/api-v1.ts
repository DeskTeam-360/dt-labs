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

export type TimeWindow = {
  start: Date
  end: Date
  /** What the caller asked for, echoed back in responses */
  label: { from: string; to: string } | { since: string; until: string }
}

/**
 * The time range of a request. Three ways, in this order:
 * hours=24 (the last 24 hours up to now; 1 to 720), since=<ISO datetime> with optional until=<ISO datetime>,
 * or from=YYYY-MM-DD with optional to=YYYY-MM-DD (WIB days, default today). `maxDays` limits the span.
 */
export function resolveWindow(q: URLSearchParams, maxDays: number): TimeWindow | { error: string } {
  const now = new Date()
  const hoursParam = q.get('hours')
  const sinceParam = q.get('since')
  if (hoursParam || sinceParam) {
    let start: Date
    let end = now
    if (hoursParam) {
      const h = Number(hoursParam)
      if (!Number.isFinite(h) || h < 1 || h > 720) return { error: 'hours must be between 1 and 720' }
      start = new Date(now.getTime() - h * 3600000)
    } else {
      start = new Date(sinceParam!)
      if (Number.isNaN(start.getTime())) return { error: 'since must be an ISO date and time, e.g. 2026-11-10T08:00:00+07:00' }
      const untilParam = q.get('until')
      if (untilParam) {
        end = new Date(untilParam)
        if (Number.isNaN(end.getTime())) return { error: 'until must be an ISO date and time' }
      }
    }
    if (end < start) return { error: 'until is before since' }
    if ((end.getTime() - start.getTime()) / 86400000 > maxDays) return { error: `The range can be at most ${maxDays} days` }
    return { start, end, label: { since: toWibIso(start)!, until: toWibIso(end)! } }
  }
  const from = q.get('from') ?? todayWib()
  const to = q.get('to') ?? from
  if (!isYmd(from) || !isYmd(to)) return { error: 'from and to must be YYYY-MM-DD' }
  if (to < from) return { error: 'to is before from' }
  if (Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1 > maxDays) return { error: `The range can be at most ${maxDays} days` }
  const { start, end } = wibRange(from, to)
  return { start, end, label: { from, to } }
}

/** Paging info for a list response: where the next page starts (null on the last page). */
export function pageInfo(offset: number, shown: number, total: number): { has_more: boolean; next_offset: number | null } {
  const next = offset + shown
  return next < total ? { has_more: true, next_offset: next } : { has_more: false, next_offset: null }
}
