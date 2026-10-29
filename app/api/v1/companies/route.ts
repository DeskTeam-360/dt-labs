import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { csv, pageInfo, siteUrl, sqlList, ticketVisibility } from '@/lib/api-v1'
import { companies, companyPics, db, tickets, users } from '@/lib/db'
import { ACTIVE_WORKLOAD_STATUSES } from '@/lib/skills'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 500

/**
 * GET /api/v1/companies - find a company and its id (to use as company_id on the tickets endpoint).
 * q (name contains), id (comma list), customer=1|0 (customers or not), include_inactive=1 (inactive companies are left out by default),
 * sort = name (default) or active_tickets (most first), limit (default 100, max 500) and offset.
 * Each company comes with its plan hours, account manager, PICs and how many active tickets it has.
 * Auth: browser session or an API key with the `companies:read` scope.
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'companies:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const conditions: SQL[] = []
  if (q.get('include_inactive') !== '1') conditions.push(sql`${companies.isActive} IS NOT FALSE`)
  const text = (q.get('q') ?? '').trim()
  if (text) conditions.push(sql`${companies.name} ILIKE ${'%' + text.replace(/[%_\\]/g, '\\$&') + '%'}`)
  const ids = csv(q.get('id'))
  if (ids.length) conditions.push(sql`${companies.id} IN (${sqlList(ids)})`)
  if (q.get('customer') === '1') conditions.push(eq(companies.isCustomer, true))
  if (q.get('customer') === '0') conditions.push(eq(companies.isCustomer, false))
  const sort = q.get('sort') ?? 'name'
  if (sort !== 'name' && sort !== 'active_tickets') return NextResponse.json({ error: 'sort must be name or active_tickets' }, { status: 400 })

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.get('limit')) || 100))
  const offset = Math.max(0, Number(q.get('offset')) || 0)
  const where = conditions.length ? and(...conditions) : undefined

  // The active tickets of every company (what the caller may see), counted once.
  const visible = await ticketVisibility(me)
  const countConditions: SQL[] = [eq(tickets.ticketType, 'support'), inArray(tickets.status, ACTIVE_WORKLOAD_STATUSES), sql`${tickets.companyId} IS NOT NULL`]
  if (visible) countConditions.push(visible)
  const counts = await db
    .select({
      companyId: tickets.companyId,
      active: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) FILTER (WHERE ${tickets.dueDate} IS NOT NULL AND ${tickets.dueDate} < now())::int`,
    })
    .from(tickets)
    .where(and(...countConditions))
    .groupBy(tickets.companyId)
  const countBy = new Map(counts.map((c) => [c.companyId as string, c]))

  const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(where)
  let rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      isActive: companies.isActive,
      isCustomer: companies.isCustomer,
      email: companies.email,
      domains: companies.domainList,
      planHours: companies.activeTime,
      managerName: users.fullName,
      managerEmail: users.email,
    })
    .from(companies)
    .leftJoin(users, eq(companies.activeManagerId, users.id))
    .where(where)
    .orderBy(asc(companies.name))

  // Sorting by active tickets needs the counts, so it is done here before the page is cut.
  if (sort === 'active_tickets') rows = [...rows].sort((a, b) => (countBy.get(b.id)?.active ?? 0) - (countBy.get(a.id)?.active ?? 0) || a.name.localeCompare(b.name))
  rows = rows.slice(offset, offset + limit)

  const picRows = rows.length
    ? await db
        .select({ companyId: companyPics.companyId, role: companyPics.role, fullName: users.fullName, email: users.email })
        .from(companyPics)
        .innerJoin(users, eq(companyPics.userId, users.id))
        .where(and(inArray(companyPics.companyId, rows.map((r) => r.id)), sql`${users.status} NOT IN ('inactive', 'suspended')`))
        .orderBy(desc(companyPics.role), asc(users.fullName))
    : []
  const picsBy = new Map<string, { full_name: string; email: string; role: string }[]>()
  for (const p of picRows) picsBy.set(p.companyId, [...(picsBy.get(p.companyId) ?? []), { full_name: p.fullName || p.email, email: p.email, role: p.role }])

  return NextResponse.json({
    total,
    limit,
    offset,
    ...pageInfo(offset, rows.length, total),
    companies: rows.map((r) => ({
      id: r.id,
      name: r.name,
      is_customer: r.isCustomer,
      is_active: r.isActive !== false,
      plan_hours: r.planHours,
      domains: r.domains ?? [],
      email: r.email ?? null,
      account_manager: r.managerEmail ? { full_name: r.managerName || r.managerEmail, email: r.managerEmail } : null,
      pics: picsBy.get(r.id) ?? [],
      tickets: { active: countBy.get(r.id)?.active ?? 0, overdue: countBy.get(r.id)?.overdue ?? 0 },
      url: `${siteUrl()}/settings/companies/${r.id}`,
    })),
  })
}
