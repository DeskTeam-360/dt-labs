import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, maintenanceTemplateItems, maintenanceTemplates } from '@/lib/db'
import { MAINTENANCE_SOURCE_VALUES } from '@/lib/maintenance-sources'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function staff(id: string, write: boolean) {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (role === 'customer' || (write && !['admin', 'operations'].includes(role))) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: NextResponse.json({ error: 'Invalid template' }, { status: 400 }) }
  return {}
}

/** GET /api/maintenance-templates/{id} - the template with its header, footer, colours and items. Staff. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const s = await staff(id, false)
  if (s.error) return s.error
  const [t] = await db.select().from(maintenanceTemplates).where(eq(maintenanceTemplates.id, id)).limit(1)
  if (!t) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  const items = await db.select().from(maintenanceTemplateItems).where(eq(maintenanceTemplateItems.templateId, id)).orderBy(asc(maintenanceTemplateItems.pos))
  return NextResponse.json({
    template: {
      id: t.id,
      key: t.key,
      name: t.name,
      is_active: t.isActive,
      header_title: t.headerTitle ?? '',
      header_subtitle: t.headerSubtitle ?? '',
      header_image_url: t.headerImageUrl ?? '',
      footer_text: t.footerText,
      footer_image_url: t.footerImageUrl ?? '',
      color_primary: t.colorPrimary ?? '',
      color_section: t.colorSection ?? '',
    },
    items: items.map((i) => ({ section: i.section, label: i.label, options: i.options, source: i.source })),
  })
}

const text = (v: unknown, max: number) => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || null
}
const imageUrl = (v: unknown) => {
  const s = text(v, 2000)
  return s && (/^https?:\/\//i.test(s) || s.startsWith('/')) ? s : null
}
const color = (v: unknown) => {
  const s = String(v ?? '').trim()
  return /^#[0-9a-f]{6}$/i.test(s) ? s : null
}

/**
 * PUT /api/maintenance-templates/{id} - saves the template and replaces its items (admin, operations).
 * Reports already made keep their own copy of the items, so this only changes new reports (and the look of existing ones).
 * footer_text: null = the built-in text; "" = no footer text.
 */
export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const s = await staff(id, true)
  if (s.error) return s.error
  const [t] = await db.select({ id: maintenanceTemplates.id }).from(maintenanceTemplates).where(eq(maintenanceTemplates.id, id)).limit(1)
  if (!t) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(b.name ?? '').trim().slice(0, 100)
  if (!name) return NextResponse.json({ error: 'Give the template a name' }, { status: 400 })

  const rawItems = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : []
  if (rawItems.length > 200) return NextResponse.json({ error: 'At most 200 items per template' }, { status: 400 })
  const items: { section: string; label: string; options: string[]; source: string | null }[] = []
  for (const r of rawItems) {
    const section = String(r.section ?? '').trim().slice(0, 100)
    const label = String(r.label ?? '').trim().slice(0, 300)
    if (!section || !label) return NextResponse.json({ error: 'Every item needs a section and a name' }, { status: 400 })
    const options = (Array.isArray(r.options) ? r.options : []).map((o) => String(o).trim().slice(0, 100)).filter(Boolean).slice(0, 8)
    const source = r.source ? String(r.source) : null
    if (source && !MAINTENANCE_SOURCE_VALUES.includes(source)) return NextResponse.json({ error: `Unknown automatic source "${source}"` }, { status: 400 })
    // A check that can find a problem needs a second status for it, or the problem would be shown as Done.
    const canFail = !!source && !source.startsWith('shot_') && !source.startsWith('domain_')
    if (canFail && options.length === 1) options.push('Problem found')
    items.push({ section, label, options: options.length ? options : ['Done'], source })
  }

  await db
    .update(maintenanceTemplates)
    .set({
      name,
      headerTitle: text(b.header_title, 200),
      headerSubtitle: text(b.header_subtitle, 500),
      headerImageUrl: imageUrl(b.header_image_url),
      footerText: b.footer_text === null || b.footer_text === undefined ? null : String(b.footer_text).trim().slice(0, 500),
      footerImageUrl: imageUrl(b.footer_image_url),
      colorPrimary: color(b.color_primary),
      colorSection: color(b.color_section),
      isActive: b.is_active !== false,
    })
    .where(eq(maintenanceTemplates.id, id))

  await db.delete(maintenanceTemplateItems).where(eq(maintenanceTemplateItems.templateId, id))
  if (items.length > 0) await db.insert(maintenanceTemplateItems).values(items.map((i, n) => ({ templateId: id, pos: n + 1, ...i })))
  return NextResponse.json({ ok: true })
}
