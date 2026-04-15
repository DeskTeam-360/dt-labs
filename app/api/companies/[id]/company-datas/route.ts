import { and,eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyDatas } from '@/lib/db'

/** POST /api/companies/[id]/company-datas - upsert company data fields */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { datas } = body

  if (!id) {
    return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })
  }

  if (!Array.isArray(datas)) {
    return NextResponse.json({ error: 'Invalid data format' }, { status: 400 })
  }

  const dataToUpsert = datas.filter(
    (item: { value?: unknown }) =>
      item.value !== null && item.value !== undefined && String(item.value).trim() !== ''
  ).map((item: { data_template_id: string; value: string }) => ({
    companyId: id,
    dataTemplateId: item.data_template_id,
    value: item.value,
  }))

  if (dataToUpsert.length === 0) {
    return NextResponse.json({ message: 'No valid data to save' }, { status: 200 })
  }

  const results: unknown[] = []
  for (const item of dataToUpsert) {
    const existing = await db
      .select()
      .from(companyDatas)
      .where(and(eq(companyDatas.companyId, id), eq(companyDatas.dataTemplateId, item.dataTemplateId)))
      .limit(1)

    if (existing.length) {
      const [updated] = await db
        .update(companyDatas)
        .set({ value: item.value, updatedAt: new Date() })
        .where(eq(companyDatas.id, existing[0].id))
        .returning()
      if (updated) results.push(updated)
    } else {
      const [inserted] = await db
        .insert(companyDatas)
        .values({
          companyId: item.companyId,
          dataTemplateId: item.dataTemplateId,
          value: item.value,
        })
        .returning()
      if (inserted) results.push(inserted)
    }
  }

  return NextResponse.json({
    success: true,
    data: results,
    message: `${results.length} data fields saved successfully`,
  })
}
