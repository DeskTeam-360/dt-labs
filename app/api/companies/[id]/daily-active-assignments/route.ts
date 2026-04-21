import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { customerOwnsCompany } from '@/lib/customer-company'
import {
  companies,
  companyDailyActiveAssignments,
  db,
  teams,
  users,
} from '@/lib/db'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseYmd(raw: string | null): string | null {
  if (raw == null || raw === '') return null
  if (!DATE_RE.test(raw)) return null
  const [y, m, d] = raw.split('-').map((x) => parseInt(x, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return raw
}

function normalizeUuidBody(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string') return null
  return v
}

function parseActiveTime(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.floor(v))
}

/** Staff (non-customer session) may mutate Company Log rows for any company. */
async function requireStaffAndCompany(
  companyId: string,
  sessionUserRole: string | undefined
): Promise<NextResponse | null> {
  const role = sessionUserRole?.toLowerCase()
  if (role === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const [c] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!c) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  return null
}

async function validateTeamManager(
  activeTeamId: string | null,
  activeManagerId: string | null
): Promise<NextResponse | null> {
  if (activeTeamId) {
    const [teamRow] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, activeTeamId)).limit(1)
    if (!teamRow) return NextResponse.json({ error: 'Active team not found' }, { status: 400 })
  }
  if (activeManagerId) {
    const [mgr] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, activeManagerId))
      .limit(1)
    if (!mgr) return NextResponse.json({ error: 'Active manager not found' }, { status: 404 })
    if ((mgr.role || '').toLowerCase() === 'customer') {
      return NextResponse.json({ error: 'Active manager must be a non-customer user' }, { status: 400 })
    }
  }
  return null
}

/** GET Company Log (`company_daily_active_assignments`): ?from=&to= YYYY-MM-DD */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') {
    const ok = await customerOwnsCompany(session.user.id!, id)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [companyRow] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1)
  if (!companyRow) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const can_manage = role !== 'customer'

  const sp = request.nextUrl.searchParams
  const fromParam = parseYmd(sp.get('from'))
  const toParam = parseYmd(sp.get('to'))

  const defaultTo = new Date().toISOString().slice(0, 10)
  const defaultFromDate = new Date()
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 89)
  const defaultFrom = defaultFromDate.toISOString().slice(0, 10)

  let from = fromParam ?? defaultFrom
  let to = toParam ?? defaultTo
  if (from > to) {
    const t = from
    from = to
    to = t
  }

  const maxSpanDays = 366
  const fromMs = Date.parse(`${from}T00:00:00.000Z`)
  const toMs = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }
  if (toMs - fromMs > maxSpanDays * 86400000) {
    return NextResponse.json(
      { error: `Date range must be at most ${maxSpanDays} days` },
      { status: 400 }
    )
  }

  const rows = await db
    .select({
      id: companyDailyActiveAssignments.id,
      snapshotDate: companyDailyActiveAssignments.snapshotDate,
      activeTeamId: companyDailyActiveAssignments.activeTeamId,
      activeManagerId: companyDailyActiveAssignments.activeManagerId,
      activeTime: companyDailyActiveAssignments.activeTime,
      createdAt: companyDailyActiveAssignments.createdAt,
      teamName: teams.name,
      managerFullName: users.fullName,
      managerEmail: users.email,
    })
    .from(companyDailyActiveAssignments)
    .leftJoin(teams, eq(companyDailyActiveAssignments.activeTeamId, teams.id))
    .leftJoin(users, eq(companyDailyActiveAssignments.activeManagerId, users.id))
    .where(
      and(
        eq(companyDailyActiveAssignments.companyId, id),
        gte(companyDailyActiveAssignments.snapshotDate, from),
        lte(companyDailyActiveAssignments.snapshotDate, to)
      )
    )
    .orderBy(desc(companyDailyActiveAssignments.snapshotDate))
    .limit(500)

  const data = rows.map((r) => {
    let active_manager_display: string | null = null
    if (r.managerEmail) {
      active_manager_display = `${r.managerFullName || r.managerEmail} (${r.managerEmail})`
    }
    const snap =
      typeof r.snapshotDate === 'string'
        ? r.snapshotDate
        : r.snapshotDate != null
          ? String(r.snapshotDate)
          : ''
    return {
      id: r.id,
      snapshot_date: snap,
      active_team_id: r.activeTeamId ?? null,
      active_manager_id: r.activeManagerId ?? null,
      active_team_name: r.teamName ?? null,
      active_manager_display,
      active_time: r.activeTime ?? 0,
      created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    }
  })

  return NextResponse.json({ data, from, to, can_manage })
}

/**
 * POST Company Log — upsert one row (staff only). Body: snapshot_date, active_team_id?, active_manager_id?, active_time?
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const sessionRole = (session.user as { role?: string }).role

  const gate = await requireStaffAndCompany(id, sessionRole)
  if (gate) return gate

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const snapshotDate = parseYmd(typeof body.snapshot_date === 'string' ? body.snapshot_date : null)
  if (!snapshotDate) {
    return NextResponse.json({ error: 'snapshot_date is required (YYYY-MM-DD, UTC calendar day).' }, { status: 400 })
  }

  const activeTeamId = normalizeUuidBody(body.active_team_id)
  const activeManagerId = normalizeUuidBody(body.active_manager_id)
  const activeTime = body.active_time !== undefined ? parseActiveTime(body.active_time) : 0

  const bad = await validateTeamManager(activeTeamId, activeManagerId)
  if (bad) return bad

  await db
    .insert(companyDailyActiveAssignments)
    .values({
      companyId: id,
      snapshotDate: snapshotDate,
      activeTeamId,
      activeManagerId,
      activeTime,
    })
    .onConflictDoUpdate({
      target: [companyDailyActiveAssignments.companyId, companyDailyActiveAssignments.snapshotDate],
      set: {
        activeTeamId,
        activeManagerId,
        activeTime,
      },
    })

  return NextResponse.json({ ok: true })
}
