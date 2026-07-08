/**
 * POST /api/cron/process-recurring-tickets
 * Called every minute by the server cron job.
 * Finds all active recurring rules whose nextRunAt <= now, creates the ticket,
 * logs the run, and schedules the next run.
 */
import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db, recurringTicketRuns, recurringTickets, ticketAssignees, tickets } from '@/lib/db'
import { computeNextRunAt, type Frequency } from '@/lib/recurring-ticket-schedule'

function cronAuth(req: NextRequest): boolean {
  const secret = process.env.SYNC_INBOX_CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const key = req.headers.get('x-api-key')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : key
  return token === secret
}

export async function POST(req: NextRequest) {
  if (!cronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Find all active rules whose nextRunAt is due
  const due = await db
    .select()
    .from(recurringTickets)
    .where(
      and(
        eq(recurringTickets.isActive, true),
        isNotNull(recurringTickets.nextRunAt),
        lte(recurringTickets.nextRunAt, now)
      )
    )

  if (due.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let created = 0
  let failed = 0

  for (const rule of due) {
    try {
      // Create ticket
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

      // Assign agents
      const assigneeIds = (rule.assigneeIds as string[] | null) ?? []
      if (assigneeIds.length > 0) {
        await db.insert(ticketAssignees).values(
          assigneeIds.map((userId) => ({ ticketId: newTicket.id, userId }))
        )
      }

      // Compute next run
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

      // Update rule — set lastRunAt and nextRunAt (null if expired)
      await db
        .update(recurringTickets)
        .set({
          lastRunAt: now,
          nextRunAt: nextRunAt ?? null,
          // Deactivate if past endDate and no future run
          isActive: nextRunAt !== null ? rule.isActive : false,
          updatedAt: now,
        })
        .where(eq(recurringTickets.id, rule.id))

      // Log run
      await db.insert(recurringTicketRuns).values({
        recurringTicketId: rule.id,
        ticketId: newTicket.id,
        ranAt: now,
        status: 'success',
      })

      created++
    } catch (err) {
      failed++
      console.error(`[recurring-tickets] Failed to process rule ${rule.id}:`, err)

      // Log failed run
      await db.insert(recurringTicketRuns).values({
        recurringTicketId: rule.id,
        ticketId: null,
        ranAt: now,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ processed: due.length, created, failed })
}
