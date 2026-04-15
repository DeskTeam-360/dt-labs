import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyKnowledgeBases } from '@/lib/db'

/** DELETE /api/knowledge-bases/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await db.delete(companyKnowledgeBases).where(eq(companyKnowledgeBases.id, id))
  return NextResponse.json({ success: true })
}
