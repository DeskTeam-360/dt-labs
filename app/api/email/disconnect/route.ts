import { and,eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, emailIntegrations } from '@/lib/db'

/** POST /api/email/disconnect - Disconnect Google email integration */
export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [row] = await db
    .update(emailIntegrations)
    .set({
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isActive: false,
      emailAddress: null,
      updatedAt: new Date(),
    })
    .where(and(eq(emailIntegrations.provider, 'google')))
    .returning({ id: emailIntegrations.id })

  if (!row) {
    return NextResponse.json({ error: 'No integration to disconnect' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
