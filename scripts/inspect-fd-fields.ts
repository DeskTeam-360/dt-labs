import { appSettings, db } from '@/lib/db'

async function main() {
  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']))
  const domain = map['freshdesk_domain'] ?? ''
  const apiKey = map['freshdesk_api_key'] ?? ''
  if (!domain || !apiKey) { console.error('No FD settings found'); process.exit(1) }

  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`
  const auth = 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64')

  const res = await fetch(`${baseUrl}/api/v2/ticket_fields`, {
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
  })
  if (!res.ok) { console.error('HTTP', res.status, await res.text()); process.exit(1) }

  const fields = await res.json() as Array<{ name: string; label: string; choices: unknown }>
  for (const f of fields) {
    if (f.name === 'status' || f.name === 'ticket_type' || f.name === 'priority') {
      console.log(`\n=== ${f.name} (${f.label}) ===`)
      console.log(JSON.stringify(f.choices, null, 2))
    }
  }

  // Also show our statuses and types
  const { db: database, ticketStatuses, ticketTypes } = await import('@/lib/db')
  const s = await database.select().from(ticketStatuses)
  const t = await database.select().from(ticketTypes)
  console.log('\n=== OUR STATUSES ===')
  console.log(JSON.stringify(s.map(r => ({ id: r.id, slug: r.slug, title: r.title })), null, 2))
  console.log('\n=== OUR TYPES ===')
  console.log(JSON.stringify(t.map(r => ({ id: r.id, slug: r.slug, title: r.title })), null, 2))

  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
