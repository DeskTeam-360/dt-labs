'use client'

import { doc, getFirestore, onSnapshot } from 'firebase/firestore'
import { useEffect, useRef } from 'react'

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


export function useTicketDetailLiveSync(ticketId: number | undefined, onVersionChange: () => void | Promise<void>) {
  const cbRef = useRef(onVersionChange)
  const versionRef = useRef<number | null>(null)
  /** True after we saw this doc missing — next time it exists, refetch (first bump creates the doc). */
  const sawMissingDocRef = useRef(false)

  useEffect(() => {
    cbRef.current = onVersionChange
  }, [onVersionChange])

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
