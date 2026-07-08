import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessRecurringTickets } from '@/lib/auth-utils'
import { db, recurringTicketRuns, recurringTickets, ticketAssignees, tickets } from '@/lib/db'
import { computeNextRunAt, type Frequency } from '@/lib/recurring-ticket-schedule'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessRecurringTickets((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const [rule] = await db.select().from(recurringTickets).where(eq(recurringTickets.id, id)).limit(1)
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()

  try {
    const [newTicket] = await db
      .insert(tickets)
      .values({
        title: rule.title,
        description: rule.description ?? null,
        status: rule.ticketStatus ?? 'open',
        priority: rule.ticketPriority || null,
        teamId: rule.teamId ?? null,
        companyId: rule.companyId ?? null,
        typeId: rule.ticketTypeId ?? null,
        visibility: rule.visibility ?? 'public',
        createdBy: rule.createdBy ?? null,
        createdVia: 'recurring',
        ticketType: 'support',
      })
      .returning({ id: tickets.id })

    if (!newTicket) throw new Error('Failed to insert ticket')

    const assigneeIds = (rule.assigneeIds as string[] | null) ?? []
    if (assigneeIds.length > 0) {
      await db.insert(ticketAssignees).values(
        assigneeIds.map((userId) => ({ ticketId: newTicket.id, userId }))
      )
    }

    const schedule = {
      frequency: rule.frequency as Frequency,
      specificDays: rule.specificDays as number[] | null,
      specificDate: rule.specificDate,
      intervalDays: rule.intervalDays,
      timeOfDay: rule.timeOfDay,
      timezone: rule.timezone,
      startDate: rule.startDate,
      endDate: rule.endDate ?? null,
    }
    const nextRunAt = computeNextRunAt(schedule, now)

    await db
      .update(recurringTickets)
      .set({ lastRunAt: now, nextRunAt: nextRunAt ?? null, updatedAt: now })
      .where(eq(recurringTickets.id, id))

    await db.insert(recurringTicketRuns).values({
      recurringTicketId: id,
      ticketId: newTicket.id,
      ranAt: now,
      status: 'success',
    })

    return NextResponse.json({ ok: true, ticketId: newTicket.id })
  } catch (err) {
    await db.insert(recurringTicketRuns).values({
      recurringTicketId: id,
      ticketId: null,
      ranAt: now,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {})

    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
