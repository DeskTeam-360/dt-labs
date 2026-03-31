import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin'

export type TicketNotificationType =
  | 'mention'
  | 'assignee_added'
  | 'new_ticket_assignee'
  | 'new_comment'
  | 'status_changed'

export function diffNewAssignees(beforeIds: string[], afterIds: string[]): string[] {
  const before = new Set(beforeIds)
  return afterIds.filter((id) => id && !before.has(id))
}

/** Writes one doc per recipient under `users/{userId}/ticketNotifications/{id}`. */
export async function notifyTicketUsers(params: {
  recipientUserIds: string[]
  excludeUserId?: string | null
  ticketId: number
  ticketTitle: string
  type: TicketNotificationType
  title: string
  body: string
  actorUserId: string
  actorName: string
}): Promise<void> {
  const db = getFirebaseAdminFirestore()
  if (!db) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[notifyTicketUsers] skipped: Firebase Admin Firestore not configured (check .env service account)')
    }
    return
  }

  const exclude = params.excludeUserId != null ? String(params.excludeUserId).trim() : ''
  const recipients = [...new Set(params.recipientUserIds.map((id) => String(id).trim()))].filter(
    (id) => Boolean(id) && id !== exclude
  )
  if (recipients.length === 0) return

  const ticketTitle = (params.ticketTitle || 'Ticket').slice(0, 200)
  const batch = db.batch()
  for (const userId of recipients) {
    const ref = db.collection('users').doc(userId).collection('ticketNotifications').doc()
    batch.set(ref, {
      userId,
      ticketId: params.ticketId,
      ticketTitle,
      type: params.type,
      title: params.title.slice(0, 200),
      body: params.body.slice(0, 500),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      actorUserId: params.actorUserId,
      actorName: (params.actorName || 'Someone').slice(0, 200),
    })
  }

  try {
    await batch.commit()
  } catch (e) {
    console.error('[notifyTicketUsers] batch.commit failed:', e)
    if (process.env.NODE_ENV === 'development') {
      console.error('[notifyTicketUsers] recipients:', recipients, 'ticketId:', params.ticketId)
    }
  }
}
