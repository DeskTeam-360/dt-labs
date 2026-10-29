import { and, eq, inArray, notInArray, type SQL, sql } from 'drizzle-orm'

import { siteUrl, sqlList, toWibIso, wibDay } from '@/lib/api-v1'
import { eachDay, loadCalendarEntries } from '@/lib/calendar-query'
import { companies, db, shifts, teamMembers, ticketAssignees, tickets, userDailyCapacity, users,userSkills } from '@/lib/db'
import { ACTIVE_WORKLOAD_STATUSES, MIN_SKILL_MATCH_PCT } from '@/lib/skills'
import { loadLevel } from '@/lib/team-load-levels'
import { CLOSED_LIKE_STATUS_LIST } from '@/lib/ticket-status-workflow'
import { INACTIVE_USER_STATUSES } from '@/lib/user-status'

/**
 * Who could take tickets over, ranked on skill match, leave, shift and load. It only lists and ranks: nothing is assigned.
 */

const AGENT_ROLES = ['admin', 'operations', 'manager', 'staff']
const MAX_WINDOW_DAYS = 62

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const isWeekend = (ymd: string) => [0, 6].includes(new Date(`${ymd}T00:00:00Z`).getUTCDay())

/** Whether the WIB clock time `nowMin` (minutes since midnight) is inside a shift; a shift whose end is earlier than its start runs past midnight. */
function inShift(start: string, end: string, nowMin: number): boolean {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const s = toMin(start)
  const e = toMin(end)
  return s <= e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e
}

export type SuggestOptions = {
  fromEmail?: string
  ticketId?: number
  ticketLimit?: number
  candidatesPerTicket?: number
  visible: SQL | null
}

export async function suggestCandidates(opts: SuggestOptions): Promise<{ error: string; status: number } | Record<string, unknown>> {
  const ticketLimit = Math.min(50, Math.max(1, opts.ticketLimit ?? 20))
  const perTicket = Math.min(10, Math.max(1, opts.candidatesPerTicket ?? 3))
  const today = wibDay(new Date())
  const nowWib = new Date(Date.now() + 7 * 3600000)
  const nowMin = nowWib.getUTCHours() * 60 + nowWib.getUTCMinutes()

  // Everyone who could take work: active agents with their shift.
  const staffRows = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role, shiftTitle: shifts.title, shiftStart: shifts.startTime, shiftEnd: shifts.endTime })
    .from(users)
    .leftJoin(shifts, eq(users.shiftId, shifts.id))
    .where(and(inArray(users.role, AGENT_ROLES), notInArray(users.status, INACTIVE_USER_STATUSES)))

  let fromPerson: (typeof staffRows)[number] | undefined
  if (opts.fromEmail) {
    fromPerson = staffRows.find((s) => s.email.toLowerCase() === opts.fromEmail!.toLowerCase())
    if (!fromPerson) return { error: 'No active team member with that email', status: 404 }
  }

  // The tickets to hand over: one ticket, or what the person still holds (most urgent first).
  const conditions: SQL[] = [eq(tickets.ticketType, 'support')]
  if (opts.visible) conditions.push(opts.visible)
  let rows
  if (opts.ticketId) {
    rows = await db
      .select({ id: tickets.id, title: tickets.title, status: tickets.status, priority: tickets.priority, dueDate: tickets.dueDate, teamId: tickets.teamId, companyName: companies.name })
      .from(tickets)
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(and(eq(tickets.id, opts.ticketId), ...conditions))
      .limit(1)
    if (rows.length === 0) return { error: 'Ticket not found', status: 404 }
  } else if (fromPerson) {
    rows = await db
      .select({ id: tickets.id, title: tickets.title, status: tickets.status, priority: tickets.priority, dueDate: tickets.dueDate, teamId: tickets.teamId, companyName: companies.name })
      .from(ticketAssignees)
      .innerJoin(tickets, eq(ticketAssignees.ticketId, tickets.id))
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(and(eq(ticketAssignees.userId, fromPerson.id), sql`${tickets.status} NOT IN (${sqlList(CLOSED_LIKE_STATUS_LIST)})`, ...conditions))
      .orderBy(sql`${tickets.dueDate} ASC NULLS LAST`, tickets.id)
      .limit(ticketLimit)
  } else {
    return { error: 'from_email or ticket_id is required', status: 400 }
  }
  const ticketIds = rows.map((r) => r.id)

  // Windows: from today until the due date (a week when there is none).
  const winTo = (r: (typeof rows)[number]) => {
    const due = r.dueDate ? wibDay(r.dueDate) : null
    const t = due && due >= today ? due : due ? today : addDays(today, 6)
    return t > addDays(today, MAX_WINDOW_DAYS) ? addDays(today, MAX_WINDOW_DAYS) : t
  }
  const maxTo = rows.reduce((m, r) => (winTo(r) > m ? winTo(r) : m), today)

  const pool = staffRows.filter((s) => s.id !== fromPerson?.id)
  const poolIds = pool.map((s) => s.id)
  const teamIds = [...new Set(rows.map((r) => r.teamId).filter((v): v is string => !!v))]

  const [skillRows, teamRows, { events, holidays }, zeroRows, load] = await Promise.all([
    ticketIds.length ? db.execute(sql`SELECT ts.ticket_id AS ticket_id, s.id AS skill_id, s.name AS name, ts.is_primary AS is_primary FROM ticket_skills ts JOIN skills s ON s.id = ts.skill_id WHERE ts.ticket_id IN (${sqlList(ticketIds)})`) : Promise.resolve([]),
    teamIds.length ? db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)) : Promise.resolve([]),
    loadCalendarEntries(today, maxTo),
    poolIds.length
      ? db
          .select({ userId: userDailyCapacity.userId, d: userDailyCapacity.capacityDate })
          .from(userDailyCapacity)
          .where(and(inArray(userDailyCapacity.userId, poolIds), sql`${userDailyCapacity.capacityDate} >= ${today}`, sql`${userDailyCapacity.capacityDate} <= ${maxTo}`, sql`${userDailyCapacity.hours} <= 0`))
      : Promise.resolve([]),
    poolIds.length
      ? db
          .select({ userId: ticketAssignees.userId, ticketId: tickets.id, dueDate: tickets.dueDate })
          .from(ticketAssignees)
          .innerJoin(tickets, eq(ticketAssignees.ticketId, tickets.id))
          .where(and(inArray(ticketAssignees.userId, poolIds), inArray(tickets.status, ACTIVE_WORKLOAD_STATUSES), eq(tickets.ticketType, 'support')))
      : Promise.resolve([]),
  ])

  type SkillRow = { ticket_id: number; skill_id: string; name: string; is_primary: boolean }
  const ticketSkills = new Map<number, SkillRow[]>()
  for (const s of (Array.isArray(skillRows) ? skillRows : ((skillRows as { rows?: unknown[] }).rows ?? [])) as SkillRow[]) {
    ticketSkills.set(s.ticket_id, [...(ticketSkills.get(s.ticket_id) ?? []), s])
  }
  const allSkillIds = [...new Set([...ticketSkills.values()].flat().map((s) => s.skill_id))]
  const have = poolIds.length && allSkillIds.length
    ? await db.select({ userId: userSkills.userId, skillId: userSkills.skillId, level: userSkills.level }).from(userSkills).where(and(inArray(userSkills.userId, poolIds), inArray(userSkills.skillId, allSkillIds)))
    : []
  const haveBy = new Map<string, Map<string, number>>()
  for (const h of have) (haveBy.get(h.userId) ?? haveBy.set(h.userId, new Map()).get(h.userId)!).set(h.skillId, h.level)

  const teamMembersBy = new Map<string, Set<string>>()
  for (const t of teamRows) (teamMembersBy.get(t.teamId) ?? teamMembersBy.set(t.teamId, new Set()).get(t.teamId)!).add(t.userId)

  const holidayOf = new Set(holidays.map((h) => h.date))
  for (const e of events) if (e.type === 'holiday') for (const d of eachDay(e.start_date < today ? today : e.start_date, e.end_date > maxTo ? maxTo : e.end_date)) holidayOf.add(d)
  const leaveBy = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.type !== 'leave' || !e.user_id) continue
    const set = leaveBy.get(e.user_id) ?? new Set<string>()
    for (const d of eachDay(e.start_date < today ? today : e.start_date, e.end_date > maxTo ? maxTo : e.end_date)) set.add(d)
    leaveBy.set(e.user_id, set)
  }
  const zero = new Set(zeroRows.map((z) => `${z.userId}|${z.d}`))

  const openBy = new Map<string, { n: number; due: string[] }>()
  for (const l of load) {
    const e = openBy.get(l.userId) ?? { n: 0, due: [] }
    e.n++
    if (l.dueDate) e.due.push(wibDay(l.dueDate))
    openBy.set(l.userId, e)
  }

  const out = rows.map((r) => {
    const to = winTo(r)
    const dueDay = r.dueDate ? wibDay(r.dueDate) : null
    const days = eachDay(today, to)
    const working = days.filter((d) => !isWeekend(d) && !holidayOf.has(d))
    const skillsOfTicket = ticketSkills.get(r.id) ?? []
    const noSkills = skillsOfTicket.length === 0
    const primary = skillsOfTicket.find((s) => s.is_primary)
    const members = r.teamId ? teamMembersBy.get(r.teamId) : undefined

    const candidates = pool
      .filter((s) => !members || members.size === 0 || members.has(s.id))
      .map((s) => {
        const mine = haveBy.get(s.id) ?? new Map<string, number>()
        const matched = skillsOfTicket.filter((k) => mine.has(k.skill_id))
        const pct = noSkills ? null : Math.round((matched.length / skillsOfTicket.length) * 100)
        const skillOk = noSkills || (pct ?? 0) >= MIN_SKILL_MATCH_PCT
        const avail = working.filter((d) => !leaveBy.get(s.id)?.has(d) && !zero.has(`${s.id}|${d}`))
        const onLeave = working.filter((d) => leaveBy.get(s.id)?.has(d)).length
        const availableOnDue = dueDay && dueDay >= today && dueDay <= to ? avail.includes(dueDay) : null
        const open = openBy.get(s.id)?.n ?? 0
        const dueIn = (openBy.get(s.id)?.due ?? []).filter((d) => d >= today && d <= to).length
        const shift = s.shiftTitle ? { title: s.shiftTitle, start: String(s.shiftStart).slice(0, 5), end: String(s.shiftEnd).slice(0, 5), timezone: 'WIB' } : null
        const onShiftNow = shift ? inShift(shift.start, shift.end, nowMin) : null
        const eligible = skillOk && avail.length > 0 && availableOnDue !== false
        const avg = matched.length ? Math.round((matched.reduce((sum, k) => sum + (mine.get(k.skill_id) ?? 0), 0) / matched.length) * 10) / 10 : null

        const reasons: string[] = []
        const concerns: string[] = []
        if (noSkills) concerns.push('The ticket has no skills set, so skill fit is unknown')
        else if (pct === 100) reasons.push(`Has all ${skillsOfTicket.length} skill(s) of the ticket`)
        else if (skillOk) reasons.push(`Has ${matched.length} of ${skillsOfTicket.length} skills`)
        else concerns.push(`Covers only ${matched.length} of ${skillsOfTicket.length} skills`)
        if (!noSkills && skillOk && matched.length < skillsOfTicket.length) {
          concerns.push(`Missing: ${skillsOfTicket.filter((k) => !mine.has(k.skill_id)).map((k) => k.name).join(', ')}`)
        }
        if (working.length > 0) {
          if (avail.length === working.length) reasons.push(`Free all ${avail.length} working day(s) until the due date`)
          else if (avail.length > 0) concerns.push(`Available ${avail.length} of ${working.length} working days (${onLeave} on leave)`)
          else concerns.push('Not available on any working day in the window')
        }
        if (availableOnDue === false) concerns.push('Not available on the due date')
        if (availableOnDue === true) reasons.push('Available on the due date')
        if (onShiftNow === true) reasons.push(`On shift now (${shift!.title})`)
        if (onShiftNow === false) concerns.push(`Off shift now (${shift!.title} ${shift!.start}-${shift!.end} WIB)`)
        if (!shift) concerns.push('No shift set')
        reasons.push(open === 0 ? 'No other active tickets' : `${open} other active ticket(s)`)
        if (loadLevel(open) !== 'normal') concerns.push(`Heavy load (${loadLevel(open)}): ${open} active tickets`)
        if (dueIn > 0) concerns.push(`${dueIn} of their other tickets are due in the window`)

        return {
          id: s.id,
          full_name: s.fullName || s.email,
          email: s.email,
          role: s.role,
          eligible,
          match_pct: pct,
          matched_skills: matched.map((k) => k.name),
          missing_skills: skillsOfTicket.filter((k) => !mine.has(k.skill_id)).map((k) => k.name),
          primary_skill_level: primary ? (mine.get(primary.skill_id) ?? null) : null,
          average_skill_level: avg,
          open_tickets: open,
          load_level: loadLevel(open),
          tickets_due_in_window: dueIn,
          available_days: avail.length,
          window_working_days: working.length,
          on_leave_days: onLeave,
          available_on_due_date: availableOnDue,
          shift,
          on_shift_now: onShiftNow,
          reasons,
          concerns,
        }
      })
      .sort(
        (a, b) =>
          Number(b.eligible) - Number(a.eligible) ||
          (b.match_pct === 100 ? 1 : 0) - (a.match_pct === 100 ? 1 : 0) ||
          Number(b.available_on_due_date === true) - Number(a.available_on_due_date === true) ||
          Number(b.on_shift_now === true) - Number(a.on_shift_now === true) ||
          a.open_tickets - b.open_tickets ||
          a.tickets_due_in_window - b.tickets_due_in_window ||
          (b.primary_skill_level ?? 0) - (a.primary_skill_level ?? 0) ||
          (b.average_skill_level ?? 0) - (a.average_skill_level ?? 0) ||
          a.full_name.localeCompare(b.full_name)
      )

    return {
      ticket: {
        id: r.id,
        title: r.title,
        status: r.status,
        priority: r.priority,
        due_date: toWibIso(r.dueDate),
        company: r.companyName ?? null,
        skills: skillsOfTicket.map((k) => k.name),
        primary_skill: primary?.name ?? null,
        url: `${siteUrl()}/tickets/${r.id}`,
      },
      window: { from: today, to },
      eligible_count: candidates.filter((c) => c.eligible).length,
      candidates: candidates.slice(0, perTicket),
    }
  })

  const noOne = out.filter((o) => o.eligible_count === 0).map((o) => o.ticket.id)
  return {
    from_person: fromPerson
      ? { id: fromPerson.id, full_name: fromPerson.fullName || fromPerson.email, email: fromPerson.email, on_leave_today: !!leaveBy.get(fromPerson.id)?.has(today) }
      : null,
    generated_at: toWibIso(new Date()),
    summary: { tickets: out.length, with_eligible_candidate: out.length - noOne.length, without_eligible_candidate: noOne },
    suggestions: out,
  }
}
