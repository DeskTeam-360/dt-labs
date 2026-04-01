import { auth } from '@/auth'
import { db } from '@/lib/db'
import { automationRules } from '@/lib/db'
import { canAccessAutomationRules } from '@/lib/auth-utils'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PATCH /api/automation-rules/[id] - Update rule */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessAutomationRules(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, event_type, conditions, actions, priority, company_id, status } = body

  const values: Record<string, unknown> = {}
  if (name !== undefined) values.name = name ? String(name).trim() : null
  if (event_type !== undefined) values.eventType = String(event_type)
  if (conditions !== undefined) {
    values.conditions = typeof conditions === 'object' ? conditions : JSON.parse(conditions || '{}')
  }
  if (actions !== undefined) {
    values.actions = typeof actions === 'object' ? actions : JSON.parse(actions || '{}')
  }
  if (priority !== undefined) values.priority = Number(priority) ?? 0
  if (company_id !== undefined) values.companyId = company_id || null
  if (status !== undefined) values.status = !!status

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(automationRules)
    .set(values as typeof automationRules.$inferInsert)
    .where(eq(automationRules.id, parseInt(id)))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    event_type: updated.eventType,
    conditions: updated.conditions,
    actions: updated.actions,
    priority: updated.priority,
    company_id: updated.companyId,
    status: updated.status,
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/automation-rules/[id] - Delete rule */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessAutomationRules(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const [deleted] = await db
    .delete(automationRules)
    .where(eq(automationRules.id, parseInt(id)))
    .returning({ id: automationRules.id })

  if (!deleted) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
