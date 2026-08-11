import 'dotenv/config'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '../lib/db/schema'

const {
  tickets, ticketComments, ticketTags, ticketTimeTracker,
  ticketChecklist, ticketAssignees, ticketAiSummaries,
  ticketActivityLog, ticketAttachments, ticketCcRecipients,
} = schema

const client = postgres((process.env.DATABASE_URL || '').replace(/\?schema=public/, ''), { prepare: false, max: 1 })
const db = drizzle(client, { schema })

async function main() {
  console.log('Deleting ALL ticket data...\n')
  await db.delete(ticketComments);     console.log('  ticket_comments: deleted')
  await db.delete(ticketTags);         console.log('  ticket_tags: deleted')
  await db.delete(ticketTimeTracker);  console.log('  ticket_time_tracker: deleted')
  await db.delete(ticketChecklist);    console.log('  ticket_checklist: deleted')
  await db.delete(ticketAssignees);    console.log('  ticket_assignees: deleted')
  await db.delete(ticketAiSummaries);  console.log('  ticket_ai_summaries: deleted')
  await db.delete(ticketActivityLog);  console.log('  ticket_activity_log: deleted')
  await db.delete(ticketAttachments);  console.log('  ticket_attachments: deleted')
  await db.delete(ticketCcRecipients); console.log('  ticket_cc_recipients: deleted')
  await db.delete(tickets);            console.log('  tickets: deleted')
  console.log('\nDone.')
  await client.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
