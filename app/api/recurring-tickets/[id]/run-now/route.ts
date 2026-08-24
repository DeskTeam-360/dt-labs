import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessRecurringTickets } from '@/lib/auth-utils'
import { db, recurringTicketRuns, recurringTickets, ticketAssignees, tickets } from '@/lib/db'
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
    const desiredRank = parseCompanyTicketDesiredRank(rule.ticketPriority ?? 0)
    let newTicket: { id: number } | undefined

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(tickets)
        .values({
          title: rule.title,
          description: rule.description ?? null,
          status: rule.ticketStatus ?? 'open',
          priority: rule.companyId ? null : (rule.ticketPriority || null),
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

      if (!row) throw new Error('Failed to insert ticket')

      const scope = await resolveSupportQueueScope(tx, row.id)
      if (scope) {
        if (scope.kind === 'company') {
          await assignCompanySupportTicketRank(tx, scope.companyId, row.id, desiredRank)
        } else {
          await assignCreatorSupportTicketRank(tx, scope.userId, row.id, desiredRank)
        }
      }

      const assigneeIds = Array.isArray(rule.assigneeIds) ? rule.assigneeIds as string[] : []
      if (assigneeIds.length > 0) {
        await tx.insert(ticketAssignees).values(assigneeIds.map((userId) => ({ ticketId: row.id, userId })))
      }

      newTicket = row
    })

    if (!newTicket) throw new Error('Failed to insert ticket')

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
    // Always schedule next run from tomorrow midnight so the cron doesn't fire again today
    const tomorrowMidnight = new Date(now)
    tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1)
    tomorrowMidnight.setUTCHours(0, 0, 0, 0)
    const nextRunAt = computeNextRunAt(schedule, tomorrowMidnight)

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
