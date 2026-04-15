import { asc, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { announcementVisibleForViewer } from '@/lib/dashboard-announcement'
import { dashboardAnnouncements,db } from '@/lib/db'

/** GET — published announcements visible to current user (id + title only). */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const viewerRole = (session.user as { role?: string }).role

  try {
    const rows = await db
      .select()
      .from(dashboardAnnouncements)
      .where(eq(dashboardAnnouncements.isPublished, true))
      .orderBy(asc(dashboardAnnouncements.sortOrder), desc(dashboardAnnouncements.updatedAt))

    const items = rows
      .filter((r) => announcementVisibleForViewer(r, viewerRole))
      .map((r) => ({ id: r.id, title: r.title }))

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
