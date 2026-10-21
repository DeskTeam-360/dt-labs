import { and, eq, inArray, ne, sql } from 'drizzle-orm'

import { companyTypeSkills, db, skills, teamMembers, ticketAssignees, tickets, ticketSkills, users,userSkills } from '@/lib/db'
import { getCapacityHoursByUser, wibTodayYmd } from '@/lib/user-capacity'

/** Keep only ids that exist in the catalog (a deleted skill must not break a save). */
export async function validSkillIds(ids: unknown): Promise<string[]> {
  const list = Array.isArray(ids) ? [...new Set(ids.map((v) => String(v)))] : []
  if (list.length === 0) return []
  const rows = await db.select({ id: skills.id }).from(skills).where(inArray(skills.id, list))
  return rows.map((r) => r.id)
}

export type SkillSet = { skill_ids: string[]; primary_skill_id: string | null }

/** The primary skill must be one of the chosen skills. */
function cleanPrimary(ids: string[], primary: unknown): string | null {
  const p = primary == null || primary === '' ? null : String(primary)
  return p && ids.includes(p) ? p : null
}

export async function getTicketSkillIds(ticketId: number): Promise<string[]> {
  return (await getTicketSkillSet(ticketId)).skill_ids
}

export async function getTicketSkillSet(ticketId: number): Promise<SkillSet> {
  const rows = await db
    .select({ id: ticketSkills.skillId, p: ticketSkills.isPrimary })
    .from(ticketSkills)
    .where(eq(ticketSkills.ticketId, ticketId))
  return { skill_ids: rows.map((r) => r.id), primary_skill_id: rows.find((r) => r.p)?.id ?? null }
}

export async function setTicketSkills(ticketId: number, ids: string[], primaryId?: unknown): Promise<void> {
  const primary = cleanPrimary(ids, primaryId)
  await db.transaction(async (tx) => {
    await tx.delete(ticketSkills).where(eq(ticketSkills.ticketId, ticketId))
    if (ids.length) {
      await tx.insert(ticketSkills).values(ids.map((skillId) => ({ ticketId, skillId, isPrimary: skillId === primary })))
    }
  })
}

export async function getUserSkillIds(userId: string): Promise<string[]> {
  const rows = await db.select({ id: userSkills.skillId }).from(userSkills).where(eq(userSkills.userId, userId))
  return rows.map((r) => r.id)
}

export const DEFAULT_SKILL_LEVEL = 5

export type UserSkillLevel = { skill_id: string; level: number }

export async function getUserSkillLevels(userId: string): Promise<UserSkillLevel[]> {
  const rows = await db.select({ id: userSkills.skillId, level: userSkills.level }).from(userSkills).where(eq(userSkills.userId, userId))
  return rows.map((r) => ({ skill_id: r.id, level: r.level }))
}

/** Replace a user's skills. Each item carries its level (1-10); a missing or invalid level becomes the default. */
export async function setUserSkills(userId: string, items: { skillId: string; level?: unknown }[]): Promise<void> {
  const clamp = (v: unknown) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : DEFAULT_SKILL_LEVEL
  }
  await db.transaction(async (tx) => {
    await tx.delete(userSkills).where(eq(userSkills.userId, userId))
    if (items.length) await tx.insert(userSkills).values(items.map((i) => ({ userId, skillId: i.skillId, level: clamp(i.level) })))
  })
}

/** Default (pre-)skills for a company + ticket type. */
export async function getDefaultSkillSet(
  companyId: string | null | undefined,
  typeId: number | null | undefined
): Promise<SkillSet> {
  if (!companyId || typeId == null) return { skill_ids: [], primary_skill_id: null }
  const rows = await db
    .select({ id: companyTypeSkills.skillId, p: companyTypeSkills.isPrimary })
    .from(companyTypeSkills)
    .where(and(eq(companyTypeSkills.companyId, companyId), eq(companyTypeSkills.typeId, typeId)))
  return { skill_ids: rows.map((r) => r.id), primary_skill_id: rows.find((r) => r.p)?.id ?? null }
}

/** Copy the company + type defaults (and their primary skill) onto a new ticket. */
export async function applyDefaultSkillsToTicket(
  ticketId: number,
  companyId: string | null | undefined,
  typeId: number | null | undefined
): Promise<void> {
  const d = await getDefaultSkillSet(companyId, typeId)
  if (d.skill_ids.length) await setTicketSkills(ticketId, d.skill_ids, d.primary_skill_id)
}

export { cleanPrimary }

/** A person is only recommended when they cover at least this share of the ticket's skills. */
export const MIN_SKILL_MATCH_PCT = 50
/** Only tickets in these statuses count as a person's current workload. */
export const ACTIVE_WORKLOAD_STATUSES = ['open', 'received', 'working_team']

export type AssigneeSuggestion = {
  user_id: string
  name: string
  match_pct: number
  active_tickets: number
  matched: string[]
  missing: string[]
  /** Only set when this person ties with someone else (same group and workload): their level, to help choose. */
  level_note: string | null
}

/**
 * Who could take this ticket. Match = share of the ticket's skills the person has (>= MIN_SKILL_MATCH_PCT).
 * Order: people with a 100% match first, then everyone else; inside each group the lowest workload first
 * (tickets in open / received / working_team). Only when two people tie on both, the higher level wins:
 * the level of the ticket's primary skill when it has one, otherwise the average level over the matched skills.
 * Staff off today are skipped.
 */
export async function recommendAssignees(ticketId: number, limit = 5): Promise<{ no_skills: boolean; suggestions: AssigneeSuggestion[] }> {
  const { skill_ids: skillIds, primary_skill_id: primaryId } = await getTicketSkillSet(ticketId)
  if (skillIds.length === 0) return { no_skills: true, suggestions: [] }

  const [ticket] = await db.select({ teamId: tickets.teamId }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  const skillRows = await db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(skills.id, skillIds))
  const skillName = new Map(skillRows.map((r) => [r.id, r.name]))

  let candidates = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email })
    .from(users)
    .where(and(inArray(users.role, ['admin', 'manager', 'staff']), eq(users.status, 'active')))
  if (ticket?.teamId) {
    const members = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, ticket.teamId))
    const inTeam = new Set(members.map((m) => m.userId))
    if (inTeam.size > 0) candidates = candidates.filter((c) => inTeam.has(c.id))
  }
  if (candidates.length === 0) return { no_skills: false, suggestions: [] }
  const candidateIds = candidates.map((c) => c.id)

  const [have, load, capacity] = await Promise.all([
    db.select({ userId: userSkills.userId, skillId: userSkills.skillId, level: userSkills.level }).from(userSkills).where(
      and(inArray(userSkills.userId, candidateIds), inArray(userSkills.skillId, skillIds))
    ),
    db
      .select({ userId: ticketAssignees.userId, n: sql<number>`count(*)::int` })
      .from(ticketAssignees)
      .innerJoin(tickets, eq(ticketAssignees.ticketId, tickets.id))
      .where(
        and(
          inArray(ticketAssignees.userId, candidateIds),
          inArray(tickets.status, ACTIVE_WORKLOAD_STATUSES),
          eq(tickets.ticketType, 'support'),
          ne(tickets.id, ticketId)
        )
      )
      .groupBy(ticketAssignees.userId),
    getCapacityHoursByUser(candidateIds, wibTodayYmd(), wibTodayYmd()),
  ])
  const haveBy = new Map<string, Map<string, number>>()
  for (const h of have) (haveBy.get(h.userId) ?? haveBy.set(h.userId, new Map()).get(h.userId)!).set(h.skillId, h.level)
  const loadBy = new Map(load.map((l) => [l.userId, Number(l.n)]))

  const out: AssigneeSuggestion[] = []
  const rank = new Map<string, { primaryLevel: number; avgLevel: number }>()
  for (const c of candidates) {
    if ((capacity.get(c.id) ?? 0) <= 0) continue // off today (leave / holiday / weekend)
    const mine = haveBy.get(c.id) ?? new Map<string, number>()
    const matched = skillIds.filter((id) => mine.has(id))
    const pct = Math.round((matched.length / skillIds.length) * 100)
    if (pct < MIN_SKILL_MATCH_PCT) continue
    const avgLevel = matched.reduce((sum, id) => sum + (mine.get(id) ?? 0), 0) / matched.length
    const primaryLevel = primaryId ? (mine.get(primaryId) ?? 0) : 0
    out.push({
      user_id: c.id,
      name: c.fullName || c.email,
      match_pct: pct,
      active_tickets: loadBy.get(c.id) ?? 0,
      matched: matched.map((id) => skillName.get(id) ?? id),
      missing: skillIds.filter((id) => !mine.has(id)).map((id) => skillName.get(id) ?? id),
      level_note: null,
    })
    rank.set(c.id, { primaryLevel, avgLevel })
  }
  const tier = (x: AssigneeSuggestion) => (x.match_pct === 100 ? 0 : 1)
  out.sort((a, b) => {
    const ra = rank.get(a.user_id)!
    const rb = rank.get(b.user_id)!
    return (
      tier(a) - tier(b) ||
      a.active_tickets - b.active_tickets ||
      rb.primaryLevel - ra.primaryLevel ||
      rb.avgLevel - ra.avgLevel ||
      b.match_pct - a.match_pct ||
      a.name.localeCompare(b.name)
    )
  })

  // Levels are only shown when people tie on group and workload (that is when the level decides the order).
  const groupSize = new Map<string, number>()
  for (const x of out) groupSize.set(`${tier(x)}|${x.active_tickets}`, (groupSize.get(`${tier(x)}|${x.active_tickets}`) ?? 0) + 1)
  const primaryName = primaryId ? skillName.get(primaryId) : null
  for (const x of out) {
    if ((groupSize.get(`${tier(x)}|${x.active_tickets}`) ?? 0) < 2) continue
    const r = rank.get(x.user_id)!
    x.level_note = primaryName
      ? `${primaryName}: ${r.primaryLevel > 0 ? `${r.primaryLevel}/10` : 'not set'} · average ${Math.round(r.avgLevel * 10) / 10}/10`
      : `Average level ${Math.round(r.avgLevel * 10) / 10}/10`
  }
  return { no_skills: false, suggestions: out.slice(0, limit) }
}
