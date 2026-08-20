import { sql } from 'drizzle-orm'

import { db, ticketComments, tickets } from '@/lib/db'

async function main() {
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(tickets)
  console.log('Tickets before:', c)
  await db.delete(ticketComments)
  await db.delete(tickets)
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('tickets','id'), 199999, true)`)
  const [{ c: after }] = await db.select({ c: sql<number>`count(*)::int` }).from(tickets)
  console.log('Tickets after:', after)
  console.log('Sequence reset — next ticket will be 200000')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
