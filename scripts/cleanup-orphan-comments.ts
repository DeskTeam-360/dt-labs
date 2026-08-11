import 'dotenv/config'

import postgres from 'postgres'

const client = postgres((process.env.DATABASE_URL || '').replace(/\?schema=public/, ''), { prepare: false, max: 1 })

async function main() {
  const r = await client`DELETE FROM ticket_comments WHERE ticket_id NOT IN (SELECT id FROM tickets) RETURNING id`
  console.log(`Deleted ${r.length} orphan comments`)
  await client.end()
}

main().catch(console.error)
