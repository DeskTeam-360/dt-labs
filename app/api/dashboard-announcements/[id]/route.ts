import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { announcementVisibleForViewer } from '@/lib/dashboard-announcement'
import { dashboardAnnouncements,db } from '@/lib/db'

/** GET — full announcement if visible to current user. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const viewerRole = (session.user as { role?: string }).role
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const [row] = await db.select().from(dashboardAnnouncements).where(eq(dashboardAnnouncements.id, id)).limit(1)
    if (!row || !announcementVisibleForViewer(row, viewerRole)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({
      id: row.id,
      title: row.title,
      body: row.body ?? '',
      updated_at: row.updatedAt ? row.updatedAt.toISOString() : '',
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
