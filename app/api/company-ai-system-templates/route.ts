import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyAiSystemTemplate } from '@/lib/db'
import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/company-ai-system-templates */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({ id: companyAiSystemTemplate.id, title: companyAiSystemTemplate.title })
    .from(companyAiSystemTemplate)
    .orderBy(asc(companyAiSystemTemplate.title))

  return NextResponse.json(rows)
}
