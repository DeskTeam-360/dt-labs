import 'dotenv/config'

import postgres from 'postgres'

const client = postgres((process.env.DATABASE_URL || '').replace(/\?schema=public/, ''), { prepare: false, max: 1 })

async function main() {
  await client`ALTER TABLE companies ADD COLUMN IF NOT EXISTS freshdesk_id integer`
  console.log('Added freshdesk_id column to companies table')
  await client.end()
}

main().catch(console.error)
