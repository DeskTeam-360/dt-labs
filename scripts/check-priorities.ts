import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'

async function main() {
  const rows = await db.execute(sql`SELECT id, title, slug FROM ticket_priorities ORDER BY id`); console.log('raw:', rows)
  console.log(JSON.stringify(rows.rows, null, 2))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
