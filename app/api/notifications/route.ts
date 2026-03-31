import { auth } from '@/auth'
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin'
import { NextResponse } from 'next/server'

const LIMIT = 40

/** List ticket notifications for the signed-in user (Firestore via Admin — tidak pakai auth Firebase di browser). */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getFirebaseAdminFirestore()
  if (!db) {
    return NextResponse.json({ items: [], warning: 'firebase_admin_missing' })
  }

  const uid = String(session.user.id).trim()

  try {
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('ticketNotifications')
      .orderBy('createdAt', 'desc')
      .limit(LIMIT)
      .get()

    const items = snap.docs.map((d) => {
      const data = d.data()
      const rawCreated = data.createdAt
      let createdAt: string | null = null
      if (rawCreated && typeof (rawCreated as { toDate?: () => Date }).toDate === 'function') {
        const dt = (rawCreated as { toDate: () => Date }).toDate()
        createdAt = dt ? dt.toISOString() : null
      }
      const ticketId = typeof data.ticketId === 'number' ? data.ticketId : Number(data.ticketId)
      return {
        id: d.id,
        ticketId: Number.isFinite(ticketId) ? ticketId : 0,
        ticketTitle: String(data.ticketTitle ?? ''),
        type: String(data.type ?? ''),
        title: String(data.title ?? ''),
        body: String(data.body ?? ''),
        read: Boolean(data.read),
        createdAt,
        actorUserId: String(data.actorUserId ?? ''),
        actorName: String(data.actorName ?? ''),
      }
    }).filter((row) => row.ticketId > 0)

    return NextResponse.json({ items })
  } catch (e) {
    console.error('[GET /api/notifications]', e)
    return NextResponse.json({ items: [], error: 'fetch_failed' })
  }
}
