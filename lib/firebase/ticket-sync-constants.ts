/**
 * Satu dokumen per tiket: `ticket_data_sync/{ticketId}` (field `version` naik setelah commit DB).
 *
 * Alur: User A membuka ticket #1 → client `onSnapshot` pada dokumen `ticket_data_sync/1` → ada
 * perubahan versi → callback memanggil ulang GET `/api/tickets/1/detail` (NextAuth) sehingga
 * data tiket + komentar ikut segar.
 */
export const TICKET_DATA_SYNC_COLLECTION = 'ticket_data_sync'
