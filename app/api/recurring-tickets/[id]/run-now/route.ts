import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessRecurringTickets } from '@/lib/auth-utils'
import { db, recurringTicketRuns, recurringTickets, tickets } from '@/lib/db'
import { sendRecurringTicketCreatedEmail } from '@/lib/recurring-ticket-email'
import { computeNextRunAt, type Frequency } from '@/lib/recurring-ticket-schedule'
import { assignCompanySupportTicketRank, assignCreatorSupportTicketRank, parseCompanyTicketDesiredRank, resolveSupportQueueScope } from '@/lib/ticket-company-priority-order'

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
        visibility: rule.visibility ?? 'team',
        createdBy: rule.createdBy ?? null,
        contactUserId: rule.contactUserId ?? null,
        createdVia: 'recurring',
        ticketType: 'support',
      })
      .returning({ id: tickets.id })

    if (!newTicket) throw new Error('Failed to insert ticket')

    // Assign company support queue rank (append to end if priority=0/null)
    const desiredRank = parseCompanyTicketDesiredRank(rule.ticketPriority ?? 0)
    const scope = await resolveSupportQueueScope(db, newTicket.id)
    if (scope) {
      if (scope.kind === 'company') {
        await assignCompanySupportTicketRank(db, scope.companyId, newTicket.id, desiredRank)
      } else {
        await assignCreatorSupportTicketRank(db, scope.userId, newTicket.id, desiredRank)
      }
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

    try {
      await sendRecurringTicketCreatedEmail({
        ticketId: newTicket.id,
        ticketTitle: rule.title,
        companyId: rule.companyId ?? null,
        contactUserId: rule.contactUserId ?? null,
        createdByUserId: rule.createdBy ?? null,
      })
    } catch (emailErr) {
      console.error(
        `[recurring-tickets] Email failed for rule ${id} ticket #${newTicket.id}:`,
        emailErr
      )
    }

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
