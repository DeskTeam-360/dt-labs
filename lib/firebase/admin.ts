import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getMessaging, type Messaging } from 'firebase-admin/messaging'

function normalizePrivateKey(key: string): string {
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key
}

function adminProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    undefined
  )
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    adminProjectId() &&
      process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
      process.env.FIREBASE_PRIVATE_KEY?.trim()
  )
}

/**
 * App default Firebase Admin — hanya jika service account env terisi.
 * Dipakai di API routes / server actions: notifikasi, housekeeping data Firestore.
 */
export function getFirebaseAdminApp(): App | null {
  if (!isFirebaseAdminConfigured()) return null
  if (getApps().length > 0) {
    return getApps()[0]!
  }
  const projectId = adminProjectId()!
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!.trim()
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY!.trim())
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  })
}

export function getFirebaseAdminFirestore(): Firestore | null {
  const app = getFirebaseAdminApp()
  return app ? getFirestore(app) : null
}

/** Kirim FCM dari server (topic / token); null jika Admin tidak dikonfigurasi. */
export function getFirebaseAdminMessaging(): Messaging | null {
  const app = getFirebaseAdminApp()
  return app ? getMessaging(app) : null
}
