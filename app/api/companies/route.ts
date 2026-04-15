import { and, desc, eq, inArray, isNotNull, max } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, companyUsers, db, tickets, users } from '@/lib/db'
import { upsertCompanyUserMembership } from '@/lib/upsert-company-user-membership'

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

  const [row] = await db
    .insert(companies)
    .values({
      name,
      email: email?.trim() || null,
      color: color || '#000000',
      isActive: is_active !== undefined ? is_active : true,
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

  return NextResponse.json(
    {
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        created_by: leader_user_id,
        color: row.color,
        is_active: row.isActive ?? true,
        created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
        updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
        last_ticket_updated_at: null,
      },
      success: true,
    },
    { status: 201 }
  )
}
