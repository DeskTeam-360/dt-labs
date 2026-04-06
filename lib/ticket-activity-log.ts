import { db, tickets, ticketAssignees, ticketTags, ticketActivityLog } from '@/lib/db'
import { eq } from 'drizzle-orm'
import type { TicketActivityAction } from './ticket-activity-actions'

export { TICKET_ACTIVITY_ACTIONS, type TicketActivityAction } from './ticket-activity-actions'

export type TicketActorRole = 'agent' | 'customer' | 'system' | 'automation'

export type TicketActivitySnapshot = {
  title: string
  description: string | null
  shortNote: string | null
  status: string
  visibility: string
  teamId: string | null
  typeId: number | null
  /** support | spam | trash */
  ticketType: string
  priorityId: number | null
  companyId: string | null
  dueDateIso: string | null
  assigneeIds: string[]
  tagIds: string[]
}

export async function loadTicketActivitySnapshot(
  ticketId: number
): Promise<TicketActivitySnapshot | null> {
  const [t] = await db
    .select({
      title: tickets.title,
      description: tickets.description,
      shortNote: tickets.shortNote,
      status: tickets.status,
      visibility: tickets.visibility,
      teamId: tickets.teamId,
      typeId: tickets.typeId,
      ticketType: tickets.ticketType,
      priorityId: tickets.priorityId,
      companyId: tickets.companyId,
      dueDate: tickets.dueDate,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)

  if (!t) return null

  const assignRows = await db
    .select({ userId: ticketAssignees.userId })
    .from(ticketAssignees)
    .where(eq(ticketAssignees.ticketId, ticketId))
  const tagRows = await db
    .select({ tagId: ticketTags.tagId })
    .from(ticketTags)
    .where(eq(ticketTags.ticketId, ticketId))

  return {
    title: t.title,
    description: t.description ?? null,
    shortNote: t.shortNote ?? null,
    status: t.status,
    visibility: t.visibility,
    teamId: t.teamId ?? null,
    typeId: t.typeId ?? null,
    ticketType: t.ticketType ?? 'support',
    priorityId: t.priorityId ?? null,
    companyId: t.companyId ?? null,
    dueDateIso: t.dueDate ? new Date(t.dueDate).toISOString() : null,
    assigneeIds: assignRows.map((r) => r.userId).sort(),
    tagIds: tagRows.map((r) => r.tagId).sort(),
  }
}

export function diffTicketSnapshots(
  before: TicketActivitySnapshot,
  after: TicketActivitySnapshot
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  const keys: (keyof TicketActivitySnapshot)[] = [
    'title',
    'description',
    'shortNote',
    'status',
    'visibility',
    'teamId',
    'typeId',
    'ticketType',
    'priorityId',
    'companyId',
    'dueDateIso',
  ]
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      changes[k] = { from: before[k], to: after[k] }
    }
  }
  if (JSON.stringify(before.assigneeIds) !== JSON.stringify(after.assigneeIds)) {
    changes.assignee_ids = { from: before.assigneeIds, to: after.assigneeIds }
  }
  if (JSON.stringify(before.tagIds) !== JSON.stringify(after.tagIds)) {
    changes.tag_ids = { from: before.tagIds, to: after.tagIds }
  }
  return changes
}

export async function logTicketActivity(params: {
  ticketId: number
  actorUserId: string | null
  actorRole: TicketActorRole
  action: TicketActivityAction
  metadata?: Record<string, unknown> | null
  relatedCommentId?: string | null
}): Promise<void> {
  try {
    await db.insert(ticketActivityLog).values({
      ticketId: params.ticketId,
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: params.action,
      metadata: params.metadata ?? null,
      relatedCommentId: params.relatedCommentId ?? null,
    })
  } catch (err) {
    console.error('[ticket_activity_log]', err)
  }
}
