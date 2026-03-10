import { auth } from '@/auth'
import { getPublicUrl } from '@/lib/storage-idrive'
import { db, ticketAttachments } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/tickets/[id]/attachments */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const rows = await db
    .select({
      id: ticketAttachments.id,
      fileUrl: ticketAttachments.fileUrl,
      fileName: ticketAttachments.fileName,
      filePath: ticketAttachments.filePath,
    })
    .from(ticketAttachments)
    .where(eq(ticketAttachments.ticketId, ticketId))
    .orderBy(asc(ticketAttachments.createdAt))

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      file_url: r.fileUrl || (r.filePath ? getPublicUrl(r.filePath) : ''),
      file_name: r.fileName,
      file_path: r.filePath ?? undefined,
    }))
  )
}
