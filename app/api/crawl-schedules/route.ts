import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { parseScheduleBody } from '@/lib/crawl-schedule-input'
import { nextRunFor } from '@/lib/crawl-schedule-runner'
import { db } from '@/lib/db'
import { companies, companyWebsites, crawlSchedules } from '@/lib/db/schema'

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db
    .select({ s: crawlSchedules, websiteUrl: companyWebsites.url, companyName: companies.name })
    .from(crawlSchedules)
    .leftJoin(companyWebsites, eq(crawlSchedules.companyWebsiteId, companyWebsites.id))
    .leftJoin(companies, eq(companyWebsites.companyId, companies.id))
    .orderBy(desc(crawlSchedules.createdAt))
  return NextResponse.json({ data: rows.map((r) => ({ ...r.s, websiteUrl: r.websiteUrl, companyName: r.companyName })) })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json()) as Record<string, unknown>
  const websiteId = String(body.company_website_id ?? '')
  const [site] = await db.select({ id: companyWebsites.id }).from(companyWebsites).where(eq(companyWebsites.id, websiteId)).limit(1)
  if (!site) return NextResponse.json({ error: 'Choose a website' }, { status: 400 })
  const parsed = parseScheduleBody(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const v = parsed.values
  if (!v.startDate) return NextResponse.json({ error: 'Start date is required' }, { status: 400 })
  if (v.frequency === 'specific_days' && !v.specificDays?.length) return NextResponse.json({ error: 'Pick at least one weekday' }, { status: 400 })
  if (v.frequency === 'specific_date' && !v.specificDate?.length) return NextResponse.json({ error: 'Pick at least one day of the month' }, { status: 400 })
  const next = nextRunFor(
    {
      frequency: v.frequency ?? 'specific_days',
      specificDays: v.specificDays ?? null,
      specificDate: v.specificDate ?? null,
      intervalDays: v.intervalDays ?? null,
      timeOfDay: v.timeOfDay ?? '02:00',
      timezone: v.timezone ?? 'Asia/Jakarta',
      startDate: v.startDate,
      endDate: v.endDate ?? null,
    },
    new Date()
  )
  const [row] = await db
    .insert(crawlSchedules)
    .values({ ...v, startDate: v.startDate, companyWebsiteId: websiteId, createdBy: session.user.id, nextRunAt: next })
    .returning()
  return NextResponse.json({ data: row }, { status: 201 })
}
