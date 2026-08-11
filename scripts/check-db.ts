import 'dotenv/config'

import postgres from 'postgres'

const client = postgres((process.env.DATABASE_URL || '').replace(/\?schema=public/, ''), { prepare: false, max: 1 })

async function main() {
  const [r] = await client`
    SELECT
      (SELECT COUNT(*) FROM tickets) as tickets,
      (SELECT COUNT(*) FROM ticket_comments) as comments,
      (SELECT COUNT(*) FROM companies WHERE is_customer = true) as companies,
      (SELECT COUNT(*) FROM users WHERE role = 'customer') as users
  `
  console.log('DB counts:', JSON.stringify(r))
  const recent = await client`SELECT id, title, created_via FROM tickets ORDER BY id DESC LIMIT 5`
  console.log('Recent tickets:', JSON.stringify(recent))
  await client.end()
}

main().catch(console.error)
