import { NextResponse } from 'next/server'

import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

/** GET /api/server-time - the server's clock, so the dashboard can show server time next to the team's clocks. */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ now: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
}
