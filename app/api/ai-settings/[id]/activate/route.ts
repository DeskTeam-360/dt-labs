import { eq, ne } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessAiSettings } from '@/lib/auth-utils'
import { aiSettings, db } from '@/lib/db'

/** POST /api/ai-settings/:id/activate — set this row as active, deactivate all others */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessAiSettings((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const [target] = await db.select().from(aiSettings).where(eq(aiSettings.id, id)).limit(1)
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Deactivate all others, then activate target — in a transaction
  await db.transaction(async (tx) => {
    await tx.update(aiSettings).set({ isActive: false }).where(ne(aiSettings.id, id))
    await tx.update(aiSettings).set({ isActive: true, updatedAt: new Date(), updatedBy: session.user.id }).where(eq(aiSettings.id, id))
  })

  return NextResponse.json({ ok: true })
}
