import { auth } from '@/auth'
import { db, screenshots, tickets } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import ScreenshotsContent from '@/components/content/ScreenshotsContent'

export default async function ScreenshotsPage() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  const screenshotsRows = await db
    .select({
      screenshot: screenshots,
      ticket: tickets,
    })
    .from(screenshots)
    .leftJoin(tickets, eq(screenshots.ticketId, tickets.id))
    .where(eq(screenshots.userId, session.user.id!))
    .orderBy(desc(screenshots.createdAt))

  const screenshotsData = screenshotsRows.map((r) => ({
    id: r.screenshot.id,
    file_name: r.screenshot.fileName,
    file_path: r.screenshot.filePath,
    file_url: r.screenshot.fileUrl,
    file_size: r.screenshot.fileSize ?? 0,
    mime_type: r.screenshot.mimeType ?? '',
    ticket_id: r.screenshot.ticketId,
    title: r.screenshot.title,
    description: r.screenshot.description,
    tags: r.screenshot.tags,
    created_at: r.screenshot.createdAt ? new Date(r.screenshot.createdAt).toISOString() : '',
    updated_at: r.screenshot.updatedAt ? new Date(r.screenshot.updatedAt).toISOString() : '',
    tickets: r.ticket
      ? { id: r.ticket.id, title: r.ticket.title, status: r.ticket.status }
      : null,
  }))

  const ticketsRows = await db
    .select({ id: tickets.id, title: tickets.title, status: tickets.status, dueDate: tickets.dueDate })
    .from(tickets)
    .orderBy(desc(tickets.createdAt))
    .limit(100)

  const ticketsData = ticketsRows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
  }))

  return (
    <ScreenshotsContent
      user={session.user}
      screenshots={screenshotsData}
      tickets={ticketsData}
    />
  )
}
