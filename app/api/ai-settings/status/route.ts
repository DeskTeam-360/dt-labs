import { NextResponse } from 'next/server'

import { getAiSettingsFromDb } from '@/lib/ai-chat-config'

export async function GET() {
  const row = await getAiSettingsFromDb()
  const configured = !!(row && row.isActive)
  return NextResponse.json({ configured })
}
