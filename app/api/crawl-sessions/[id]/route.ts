import { auth } from '@/auth'
import { db } from '@/lib/db'
import { crawlSessions } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** DELETE /api/crawl-sessions/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await db.delete(crawlSessions).where(eq(crawlSessions.id, id))
  return NextResponse.json({ success: true })
}
