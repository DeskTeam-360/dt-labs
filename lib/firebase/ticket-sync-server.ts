import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin'
import { TICKET_DATA_SYNC_COLLECTION } from '@/lib/firebase/ticket-sync-constants'

/**
 * Bump version so clients with `onSnapshot` on `ticket_data_sync/{ticketId}` refetch `/api/tickets/:id/detail`.
 * No-op if Firebase Admin is not configured.
 */
export function bumpTicketDataVersion(ticketId: number): void {
  const db = getFirebaseAdminFirestore()
  if (!db || !Number.isFinite(ticketId)) return
  const id = String(ticketId)
  void db
    .collection(TICKET_DATA_SYNC_COLLECTION)
    .doc(id)
    .set(
      {
        ticketId,
        version: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    .catch((e) => {
      console.error('[bumpTicketDataVersion]', ticketId, e)
    })
}
