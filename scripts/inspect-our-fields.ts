import { db, ticketStatuses, ticketTypes } from '@/lib/db'

const s = await db.select().from(ticketStatuses)
const t = await db.select().from(ticketTypes)
console.log('STATUSES:', JSON.stringify(s, null, 2))
console.log('TYPES:', JSON.stringify(t, null, 2))
process.exit(0)
