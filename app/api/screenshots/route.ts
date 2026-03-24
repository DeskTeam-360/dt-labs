import { db, screenshots, apiTokens, ticketTimeTracker, users, tickets } from '@/lib/db'
import { eq, and, isNull, desc, count } from 'drizzle-orm'
import { uploadBuffer, getPublicUrl } from '@/lib/storage-idrive'
import { NextResponse } from 'next/server'

const SCREENSHOTS_FOLDER = 'screenshots'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 401 })
    }

    const [tokenRow] = await db
      .select({ userId: apiTokens.userId, expiresAt: apiTokens.expiresAt })
      .from(apiTokens)
      .where(and(eq(apiTokens.token, token), eq(apiTokens.isActive, true)))
      .limit(1)

    if (!tokenRow) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    if (tokenRow.expiresAt && new Date(tokenRow.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.token, token))

    const userId = tokenRow.userId

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 })
    }

    const [activeTracker] = await db
      .select({ ticketId: ticketTimeTracker.ticketId })
      .from(ticketTimeTracker)
      .where(
        and(
          eq(ticketTimeTracker.userId, userId),
          isNull(ticketTimeTracker.stopTime),
          eq(ticketTimeTracker.trackerType, 'timer')
        )
      )
      .orderBy(desc(ticketTimeTracker.startTime))
      .limit(1)

    const ticketId = activeTracker?.ticketId ?? null

    let userName = 'user'
    let todoTitle = 'screenshot'

    const [userRow] = await db
      .select({ fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (userRow) {
      let nameToUse = userRow.fullName || userRow.email || 'user'
      if (userRow.fullName) {
        const firstName = userRow.fullName.trim().split(/\s+/)[0]
        nameToUse = firstName || userRow.email || 'user'
      }
      userName = nameToUse
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    }

    if (ticketId) {
      const [ticketRow] = await db
        .select({ title: tickets.title })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1)

      if (ticketRow?.title) {
        todoTitle = ticketRow.title
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50)
      }
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '-')
      .split('.')[0]
    const fileExt = file.name.split('.').pop() || 'png'
    const filePath = `${SCREENSHOTS_FOLDER}/${userName}-${todoTitle}-${timestamp}.${fileExt}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { url, error: uploadError } = await uploadBuffer(filePath, buffer, file.type)

    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 500 })
    }

    const publicUrl = url ?? getPublicUrl(filePath)
    const generatedFileName = filePath.split('/').pop() || file.name

    const [inserted] = await db
      .insert(screenshots)
      .values({
        userId,
        fileName: generatedFileName,
        filePath,
        fileUrl: publicUrl,
        fileSize: file.size,
        mimeType: file.type,
        ticketId,
      })
      .returning()

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: filePath,
      id: inserted?.id ?? null,
      todo_id: ticketId,
      auto_linked: !!ticketId,
    })
  } catch (error: unknown) {
    console.error('Failed to upload screenshot:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload screenshot' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 401 })
    }

    const [tokenRow] = await db
      .select({ userId: apiTokens.userId, expiresAt: apiTokens.expiresAt })
      .from(apiTokens)
      .where(and(eq(apiTokens.token, token), eq(apiTokens.isActive, true)))
      .limit(1)

    if (!tokenRow) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    if (tokenRow.expiresAt && new Date(tokenRow.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 100)
    const offset = parseInt(searchParams.get('offset') || '0') || 0
    const ticketIdParam = searchParams.get('todo_id') || searchParams.get('ticket_id')

    const whereClause = ticketIdParam && !isNaN(parseInt(ticketIdParam))
      ? and(eq(screenshots.userId, tokenRow.userId), eq(screenshots.ticketId, parseInt(ticketIdParam)))
      : eq(screenshots.userId, tokenRow.userId)

    const rows = await db
      .select({
        screenshot: screenshots,
        ticket: tickets,
      })
      .from(screenshots)
      .leftJoin(tickets, eq(screenshots.ticketId, tickets.id))
      .where(whereClause)
      .orderBy(desc(screenshots.createdAt))
      .limit(limit)
      .offset(offset)

    const screenshotsData = rows.map((r) => ({
      ...r.screenshot,
      tickets: r.ticket ? { id: r.ticket.id, title: r.ticket.title, status: r.ticket.status } : null,
    }))

    const [countResult] = await db
      .select({ count: count() })
      .from(screenshots)
      .where(whereClause)
    const totalCount = Number(countResult?.count ?? 0)

    return NextResponse.json({
      success: true,
      screenshots: screenshotsData,
      total: totalCount,
    })
  } catch (error: unknown) {
    console.error('Failed to list screenshots:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch screenshots' },
      { status: 500 }
    )
  }
}
