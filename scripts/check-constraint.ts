import 'dotenv/config'

import postgres from 'postgres'

const client = postgres((process.env.DATABASE_URL || '').replace(/\?schema=public/, ''), { prepare: false, max: 1 })

async function main() {
  const r = await client`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tickets' AND indexname LIKE '%priority%'`
  console.log(JSON.stringify(r, null, 2))
  await client.end()
}

main().catch(console.error)
