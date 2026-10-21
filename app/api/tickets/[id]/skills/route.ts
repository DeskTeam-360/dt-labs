import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { cleanPrimary, getTicketSkillSet, setTicketSkills, validSkillIds } from '@/lib/skills'

function isStaff(session: { user?: unknown } | null) {
  const role = ((session?.user as { role?: string } | undefined)?.role ?? '').toLowerCase()
  return ['admin', 'manager', 'staff'].includes(role)
}

/** GET /api/tickets/[id]/skills -> { skill_ids, primary_skill_id } */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const ticketId = parseInt((await params).id, 10)
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  return NextResponse.json(await getTicketSkillSet(ticketId))
}

/** PUT /api/tickets/[id]/skills { skill_ids, primary_skill_id? } - replaces the ticket's skills. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const ticketId = parseInt((await params).id, 10)
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as { skill_ids?: unknown; primary_skill_id?: unknown }
  const ids = await validSkillIds(body.skill_ids)
  const primary = cleanPrimary(ids, body.primary_skill_id)
  await setTicketSkills(ticketId, ids, primary)
  bumpTicketDataVersion(ticketId)
  return NextResponse.json({ skill_ids: ids, primary_skill_id: primary })
}
