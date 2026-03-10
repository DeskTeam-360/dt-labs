import { db, screenshots, apiTokens } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { deleteObject } from '@/lib/storage-idrive'
import { NextResponse } from 'next/server'

function validateToken(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  return token
}

async function getUserIdFromToken(token: string) {
  const [row] = await db
    .select({ userId: apiTokens.userId })
    .from(apiTokens)
    .where(and(eq(apiTokens.token, token), eq(apiTokens.isActive, true)))
    .limit(1)
  return row?.userId ?? null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = validateToken(request)
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 401 })
    }

    const userId = await getUserIdFromToken(token)
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { todo_id, ticket_id, title, description } = body
    const tId = ticket_id ?? todo_id

    const [updated] = await db
      .update(screenshots)
      .set({
        ticketId: tId != null && tId !== '' ? Number(tId) : null,
        title: title || null,
        description: description || null,
        updatedAt: new Date(),
      })
      .where(and(eq(screenshots.id, id), eq(screenshots.userId, userId)))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, screenshot: updated })
  } catch (error: unknown) {
    console.error('Failed to update screenshot:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update screenshot' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = validateToken(request)
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 401 })
    }

    const userId = await getUserIdFromToken(token)
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const { id } = await params

    const [row] = await db
      .select({ filePath: screenshots.filePath })
      .from(screenshots)
      .where(and(eq(screenshots.id, id), eq(screenshots.userId, userId)))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }

    await db
      .delete(screenshots)
      .where(and(eq(screenshots.id, id), eq(screenshots.userId, userId)))

    if (row.filePath) {
      try {
        await deleteObject(row.filePath)
      } catch (e) {
        console.error('Failed to delete file from storage:', e)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Failed to delete screenshot:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete screenshot' },
      { status: 500 }
    )
  }
}
