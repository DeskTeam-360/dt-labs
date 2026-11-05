import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { appSettings, db } from '@/lib/db'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role ?? ''
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sessionRole(session).toLowerCase() !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const all = await db.select().from(appSettings)
  const map = Object.fromEntries(all.map((r) => [r.key, r.value ?? '']))

  return NextResponse.json({
    freshdesk_domain: map['freshdesk_domain'] ?? '',
    freshdesk_api_key: map['freshdesk_api_key'] ?? '',
    fd_archive_url: map['fd_archive_url'] ?? '',
    fd_archive_api_key: map['fd_archive_api_key'] ?? '',
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sessionRole(session).toLowerCase() !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const domain = typeof body.freshdesk_domain === 'string' ? body.freshdesk_domain.trim().replace(/\/$/, '') : null
  const apiKey = typeof body.freshdesk_api_key === 'string' ? body.freshdesk_api_key.trim() : null

  if (domain !== null) {
    await db.insert(appSettings).values({ key: 'freshdesk_domain', value: domain, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: domain, updatedAt: new Date() } })
  }
  if (apiKey !== null) {
    await db.insert(appSettings).values({ key: 'freshdesk_api_key', value: apiKey, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: apiKey, updatedAt: new Date() } })
  }

  // The FD Archive (a copy of Freshdesk kept in the fd-archive app): where tickets can be imported from instead of Freshdesk.
  const archiveUrl = typeof body.fd_archive_url === 'string' ? body.fd_archive_url.trim().replace(/\/+$/, '') : null
  const archiveKey = typeof body.fd_archive_api_key === 'string' ? body.fd_archive_api_key.trim() : null
  for (const [key, value] of [['fd_archive_url', archiveUrl], ['fd_archive_api_key', archiveKey]] as const) {
    if (value === null) continue
    await db.insert(appSettings).values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } })
  }

  return NextResponse.json({ ok: true })
}
