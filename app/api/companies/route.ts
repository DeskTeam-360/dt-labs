import { and, desc, eq, inArray, isNotNull, max } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, companyUsers, db, teams, tickets, users } from '@/lib/db'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'
import { upsertCompanyUserMembership } from '@/lib/upsert-company-user-membership'

function normalizeUuidBody(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string') return null
  return v
}

function parseActiveTime(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.floor(v))
}

/** GET /api/companies - List companies */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const isActiveParam = url.searchParams.get('is_active')

  const [rows, ticketActivity] = await Promise.all([
    db.select().from(companies).orderBy(desc(companies.createdAt)),
    db
      .select({
        companyId: tickets.companyId,
        lastTicketUpdate: max(tickets.updatedAt),
      })
      .from(tickets)
      .where(isNotNull(tickets.companyId))
      .groupBy(tickets.companyId),
  ])
  const companyIds = rows.map((r) => r.id)
  const leaderByCompany = new Map<string, string>()
  if (companyIds.length > 0) {
    const leaders = await db
      .select({ companyId: companyUsers.companyId, userId: companyUsers.userId })
      .from(companyUsers)
      .where(
        and(
          inArray(companyUsers.companyId, companyIds),
          eq(companyUsers.companyRole, 'company_admin')
        )
      )
    for (const row of leaders) {
      if (!leaderByCompany.has(row.companyId)) {
        leaderByCompany.set(row.companyId, row.userId)
      }
    }
  }

  const lastTicketByCompany = new Map<string, string | null>()
  for (const row of ticketActivity) {
    const cid = row.companyId
    if (!cid) continue
    const v = row.lastTicketUpdate
    lastTicketByCompany.set(
      cid,
      v instanceof Date ? v.toISOString() : v ? String(v) : null
    )
  }

  let filtered = rows
  if (isActiveParam !== null && isActiveParam !== undefined) {
    const active = isActiveParam === 'true'
    filtered = rows.filter((r) => r.isActive === active)
  }

  const data = filtered.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    created_by: leaderByCompany.get(r.id) ?? null,
    color: r.color,
    is_active: r.isActive ?? true,
    active_team_id: r.activeTeamId ?? null,
    active_manager_id: r.activeManagerId ?? null,
    active_time: r.activeTime ?? 0,
    is_customer: r.isCustomer ?? false,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    last_ticket_updated_at: lastTicketByCompany.get(r.id) ?? null,
  }))

  return NextResponse.json({ data })
}

/** POST /api/companies - Create company */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, email, is_active, color, leader_user_id } = body
  const activeTeamId = normalizeUuidBody(body.active_team_id)
  const activeManagerId = normalizeUuidBody(body.active_manager_id)
  const activeTime = parseActiveTime(body.active_time)
  const isCustomerCompany = body.is_customer === true

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!leader_user_id || typeof leader_user_id !== 'string') {
    return NextResponse.json({ error: 'Company leader is required' }, { status: 400 })
  }

  const [leader] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, leader_user_id))
    .limit(1)
  if (!leader) {
    return NextResponse.json({ error: 'Company leader not found' }, { status: 404 })
  }
  if ((leader.role || '').toLowerCase() !== 'customer') {
    return NextResponse.json({ error: 'Company leader must be a customer user' }, { status: 400 })
  }

  if (activeTeamId) {
    const [teamRow] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, activeTeamId)).limit(1)
    if (!teamRow) {
      return NextResponse.json({ error: 'Active team not found' }, { status: 400 })
    }
  }

  if (activeManagerId) {
    const [mgr] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, activeManagerId))
      .limit(1)
    if (!mgr) {
      return NextResponse.json({ error: 'Active manager not found' }, { status: 404 })
    }
    if ((mgr.role || '').toLowerCase() === 'customer') {
      return NextResponse.json({ error: 'Active manager must be a non-customer user' }, { status: 400 })
    }
  }

  const [row] = await db
    .insert(companies)
    .values({
      name,
      email: email?.trim() || null,
      color: color || '#000000',
      isActive: is_active !== undefined ? is_active : true,
      activeTeamId,
      activeManagerId,
      activeTime,
      isCustomer: isCustomerCompany,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
  }

  await db
    .update(users)
    .set({ companyId: row.id, updatedAt: new Date() })
    .where(eq(users.id, leader_user_id))
  await upsertCompanyUserMembership({
    companyId: row.id,
    userId: leader_user_id,
    companyRole: 'company_admin',
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json(
    {
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        created_by: leader_user_id,
        color: row.color,
        is_active: row.isActive ?? true,
        active_team_id: row.activeTeamId ?? null,
        active_manager_id: row.activeManagerId ?? null,
        active_time: row.activeTime ?? 0,
        is_customer: row.isCustomer ?? false,
        created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
        updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
        last_ticket_updated_at: null,
      },
      success: true,
    },
    { status: 201 }
  )
}
