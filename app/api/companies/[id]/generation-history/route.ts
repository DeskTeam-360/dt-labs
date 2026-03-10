import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyContentGenerationHistory } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/companies/[id]/generation-history */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const rows = await db
    .select()
    .from(companyContentGenerationHistory)
    .where(eq(companyContentGenerationHistory.companyId, id))
    .orderBy(desc(companyContentGenerationHistory.createdAt))
    .limit(50)

  const data = rows.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    content: r.content,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}
