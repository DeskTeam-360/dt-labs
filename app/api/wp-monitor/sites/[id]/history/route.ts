import { NextResponse } from 'next/server'

import { wpGate } from '@/lib/wp-access'
import { loadWpSeries } from '@/lib/wp-series'

export const dynamic = 'force-dynamic'

/** GET /api/wp-monitor/sites/[id]/history?days=30 -> the numbers of each report, oldest first, for the trend charts. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await wpGate()
  if ('error' in g) return g.error
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30))
  return NextResponse.json({ points: await loadWpSeries((await ctx.params).id, days) })
}
