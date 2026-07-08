import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { type AppSettingsMap,getAppSettings, setAppSetting } from '@/lib/app-settings'
import { isAdmin } from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = await getAppSettings()
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as Partial<AppSettingsMap>
  const allowed: (keyof AppSettingsMap)[] = ['app_name', 'app_logo_url', 'app_favicon_url']

  for (const key of allowed) {
    if (key in body) {
      await setAppSetting(key, body[key] ?? null)
    }
  }

  return NextResponse.json({ ok: true })
}
