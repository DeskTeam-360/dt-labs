import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { appSettings, db } from '@/lib/db'

async function fetchFdPage(baseUrl: string, authHeader: string, page: number) {
  const res = await fetch(`${baseUrl}/api/v2/contacts?per_page=100&page=${page}`, {
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Freshdesk error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Array<{
    id: number
    name: string
    email: string | null
    phone: string | null
    mobile: string | null
    company_id: number | null
    created_at: string
  }>>
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']))
  const domain = map['freshdesk_domain'] ?? ''
  const apiKey = map['freshdesk_api_key'] ?? ''

  if (!domain || !apiKey) {
    return NextResponse.json({ error: 'Freshdesk not configured' }, { status: 503 })
  }

  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}.freshdesk.com`
  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64')

  const noCompany: Array<{ id: number; name: string; email: string | null; phone: string | null; created_at: string }> = []
  let page = 1
  let totalFetched = 0

  while (true) {
    const contacts = await fetchFdPage(baseUrl, authHeader, page)
    if (contacts.length === 0) break
    totalFetched += contacts.length
    for (const c of contacts) {
      if (!c.company_id) {
        noCompany.push({ id: c.id, name: c.name, email: c.email, phone: c.mobile || c.phone, created_at: c.created_at })
      }
    }
    if (contacts.length < 100) break
    page++
  }

  return NextResponse.json({ total_fetched: totalFetched, no_company: noCompany })
}
