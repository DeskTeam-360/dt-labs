import { auth } from '@/auth'
import { db, screenshots } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { deleteObject } from '@/lib/storage-idrive'
import { NextResponse } from 'next/server'

/** POST /api/screenshots/delete - Delete screenshot (for web app with session) */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const [row] = await db
    .select({ filePath: screenshots.filePath })
    .from(screenshots)
    .where(and(eq(screenshots.id, id), eq(screenshots.userId, session.user.id!)))
    .limit(1)

  if (!row) {
    return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
  }

  await db
    .delete(screenshots)
    .where(and(eq(screenshots.id, id), eq(screenshots.userId, session.user.id!)))

  if (row.filePath) {
    try {
      await deleteObject(row.filePath)
    } catch (e) {
      console.error('Failed to delete file from storage:', e)
    }
  }

  return NextResponse.json({ success: true })
}
