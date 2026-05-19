import { desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db, projects } from '@/lib/db'
import { requireProjectApiSession } from '@/lib/project-api-auth'
import { seedDefaultProjectStatuses } from '@/lib/project-seed-statuses'

function serializeProject(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  }
}

/** GET /api/projects — list projects */
export async function GET() {
  const gate = await requireProjectApiSession()
  if ('error' in gate) return gate.error

  const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt))
  return NextResponse.json(rows.map(serializeProject))
}

/** POST /api/projects — create project */
export async function POST(request: Request) {
  const gate = await requireProjectApiSession()
  if ('error' in gate) return gate.error

  const body = await request.json().catch(() => ({}))
  const title = String(body.title ?? body.name ?? '').trim()
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const description =
    body.description != null && String(body.description).trim() !== ''
      ? String(body.description).trim()
      : null

  const [row] = await db
    .insert(projects)
    .values({
      title,
      description,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }

  try {
    await seedDefaultProjectStatuses(row.id)
  } catch (e) {
    console.error('[POST /api/projects] seed statuses:', e)
  }

  return NextResponse.json(serializeProject(row))
}
