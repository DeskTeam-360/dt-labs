import 'dotenv/config'

import postgres from 'postgres'

const client = postgres((process.env.DATABASE_URL || '').replace(/\?schema=public/, ''), { prepare: false, max: 1 })

async function main() {
  const settings = await client`SELECT key, value FROM app_settings WHERE key IN ('freshdesk_domain','freshdesk_api_key')`
  const map: Record<string, string> = Object.fromEntries(settings.map((r) => [r.key, r.value ?? '']))
  const domain: string = map['freshdesk_domain'] ?? ''
  const apiKey: string = map['freshdesk_api_key'] ?? ''

  if (!domain || !apiKey) {
    console.log('Freshdesk settings not in DB')
    await client.end()
    return
  }

  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`
  const auth = 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64')

  let page = 1
  const fdCompanies: Array<{ id: number; name: string }> = []
  while (true) {
    const res = await fetch(`${baseUrl}/api/v2/companies?page=${page}&per_page=100`, { headers: { Authorization: auth } })
    if (!res.ok) break
    const data = (await res.json()) as Array<{ id: number; name: string }>
    if (!Array.isArray(data) || data.length === 0) break
    fdCompanies.push(...data)
    if (data.length < 100) break
    page++
  }

  console.log(`Fetched ${fdCompanies.length} companies from Freshdesk`)

  const missing = await client`SELECT id, name FROM companies WHERE freshdesk_id IS NULL AND is_customer = true`

  for (const row of missing) {
    const match = fdCompanies.find((f) => f.name.trim().toLowerCase() === row.name.trim().toLowerCase())
    if (match) {
      await client`UPDATE companies SET freshdesk_id = ${match.id} WHERE id = ${row.id}`
      console.log(`Patched "${row.name}" → freshdesk_id=${match.id}`)
    } else {
      console.log(`No FD match for "${row.name}"`)
    }
  }

  await client.end()
}

main().catch(console.error)
