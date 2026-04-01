'use client'

import { useEffect, useRef } from 'react'
import { doc, getFirestore, onSnapshot } from 'firebase/firestore'
import { getFirebaseApp, isFirebaseClientConfigured } from '@/lib/firebase/client'
import { TICKET_DATA_SYNC_COLLECTION } from '@/lib/firebase/ticket-sync-constants'

function readSyncVersionFromSnapshot(snap: { data: () => Record<string, unknown> | undefined }): number {
  const raw = snap.data()?.version
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (raw != null && typeof (raw as { toNumber?: () => number }).toNumber === 'function') {
    try {
      const n = (raw as { toNumber: () => number }).toNumber()
      if (Number.isFinite(n)) return n
    } catch {
      /* ignore */
    }
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/**
 * Live reload untuk halaman detail tiket yang sedang dibuka.
 *
 * Contoh: User A mengakses ticket #1 → hook subscribe `onSnapshot` ke dokumen
 * `ticket_data_sync/1`. Server menaikkan `version` setiap ada perubahan (komentar, PATCH tiket, dll.).
 * Saat versi berubah dibanding baseline, panggil `onVersionChange` (refetch detail + daftar komentar
 * via API dengan sesi NextAuth).
 *
 * Tidak memerlukan sign-in Firebase Auth di browser; cukup konfigurasi Firebase app + rules read pada koleksi sync.
 */
export function useTicketDetailLiveSync(ticketId: number | undefined, onVersionChange: () => void | Promise<void>) {
  const cbRef = useRef(onVersionChange)
  cbRef.current = onVersionChange
  const versionRef = useRef<number | null>(null)
  /** True after we saw this doc missing — next time it exists, refetch (first bump creates the doc). */
  const sawMissingDocRef = useRef(false)

  useEffect(() => {
    if (!ticketId || !isFirebaseClientConfigured()) return

    const app = getFirebaseApp()
    if (!app) return

    sawMissingDocRef.current = false
    versionRef.current = null

    const fs = getFirestore(app)
    const ref = doc(fs, TICKET_DATA_SYNC_COLLECTION, String(ticketId))

    const unsubDoc = onSnapshot(
      ref,
      { includeMetadataChanges: false },
      (snap) => {
        if (!snap.exists()) {
          sawMissingDocRef.current = true
          versionRef.current = null
          return
        }
        const v = readSyncVersionFromSnapshot(snap)
        if (versionRef.current === null) {
          const docNewlyAppeared = sawMissingDocRef.current
          versionRef.current = v
          if (docNewlyAppeared) {
            sawMissingDocRef.current = false
            void Promise.resolve(cbRef.current())
          }
          return
        }
        if (v !== versionRef.current) {
          versionRef.current = v
          void Promise.resolve(cbRef.current())
        }
      },
      (err) => {
        console.error('[useTicketDetailLiveSync]', ticketId, err)
      },
    )

    return () => {
      unsubDoc()
    }
  }, [ticketId])
}
