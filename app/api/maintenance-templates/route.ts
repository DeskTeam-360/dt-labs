import { asc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, maintenanceTemplateItems, maintenanceTemplates } from '@/lib/db'

export const dynamic = 'force-dynamic'

const canEdit = (role: string) => ['admin', 'operations'].includes(role)

async function staff() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (role === 'customer') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { role }
}

/** GET /api/maintenance-templates?all=1 - the templates (active ones; all=1 also the hidden ones, for the editor). Staff. */
export async function GET(request: Request) {
  const s = await staff()
  if (s.error) return s.error
  const all = new URL(request.url).searchParams.get('all') === '1' && canEdit(s.role as string)
  const rows = await db
    .select({ id: maintenanceTemplates.id, key: maintenanceTemplates.key, name: maintenanceTemplates.name, isActive: maintenanceTemplates.isActive, items: sql<number>`(SELECT count(*)::int FROM maintenance_template_items i WHERE i.template_id = maintenance_templates.id)` })
    .from(maintenanceTemplates)
    .where(all ? undefined : eq(maintenanceTemplates.isActive, true))
    .orderBy(asc(maintenanceTemplates.sortOrder), asc(maintenanceTemplates.name))
  return NextResponse.json({ data: rows.map((r) => ({ id: r.id, key: r.key, name: r.name, is_active: r.isActive, item_count: r.items })) })
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'template'

/** POST /api/maintenance-templates { name, copy_from? } - a new template, empty or a copy of another one (admin, operations). */
export async function POST(request: Request) {
  const s = await staff()
  if (s.error) return s.error
  if (!canEdit(s.role as string)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = (await request.json().catch(() => ({}))) as { name?: unknown; copy_from?: unknown }
  const name = String(b.name ?? '').trim().slice(0, 100)
  if (!name) return NextResponse.json({ error: 'Give the template a name' }, { status: 400 })

  const base = slug(name)
  let key = base
  for (let n = 2; n < 100; n++) {
    const [taken] = await db.select({ id: maintenanceTemplates.id }).from(maintenanceTemplates).where(eq(maintenanceTemplates.key, key)).limit(1)
    if (!taken) break
    key = `${base}-${n}`
  }
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(sort_order), 0)::int` }).from(maintenanceTemplates)
  const [created] = await db.insert(maintenanceTemplates).values({ key, name, sortOrder: max + 1 }).returning()

  const copyFrom = String(b.copy_from ?? '')
  if (/^[0-9a-f-]{36}$/i.test(copyFrom)) {
    const [src] = await db.select().from(maintenanceTemplates).where(eq(maintenanceTemplates.id, copyFrom)).limit(1)
    if (src) {
      await db
        .update(maintenanceTemplates)
        .set({ headerTitle: src.headerTitle, headerSubtitle: src.headerSubtitle, headerImageUrl: src.headerImageUrl, footerText: src.footerText, footerImageUrl: src.footerImageUrl, colorPrimary: src.colorPrimary, colorSection: src.colorSection })
        .where(eq(maintenanceTemplates.id, created.id))
      const items = await db.select().from(maintenanceTemplateItems).where(eq(maintenanceTemplateItems.templateId, src.id)).orderBy(asc(maintenanceTemplateItems.pos))
      if (items.length > 0) {
        await db.insert(maintenanceTemplateItems).values(items.map((i) => ({ templateId: created.id, pos: i.pos, section: i.section, label: i.label, options: i.options, source: i.source })))
      }
    }
  }
  return NextResponse.json({ ok: true, id: created.id })
}
