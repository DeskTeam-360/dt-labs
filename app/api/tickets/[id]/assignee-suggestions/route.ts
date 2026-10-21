import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { recommendAssignees } from '@/lib/skills'

/** GET /api/tickets/[id]/assignee-suggestions -> { no_skills, suggestions[] } (staff). A suggestion only; a person assigns. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const ticketId = parseInt((await params).id, 10)
  if (Number.isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  return NextResponse.json(await recommendAssignees(ticketId))
}
