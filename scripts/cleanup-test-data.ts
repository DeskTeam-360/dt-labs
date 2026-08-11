/**
 * Cleanup test data — deletes all customer-related data:
 * - tickets (+ all related rows) linked to customer companies
 * - users with role = 'customer'
 * - companies with is_customer = true
 *
 * Run: npx tsx scripts/cleanup-test-data.ts
 */
import 'dotenv/config'

import { and, eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '../lib/db/schema'

const {
  companies,
  companyUsers,
  tickets,
  ticketComments,
  ticketTags,
  ticketTimeTracker,
  ticketChecklist,
  ticketAssignees,
  ticketAiSummaries,
  ticketActivityLog,
  ticketAttachments,
  ticketCcRecipients,
  users,
} = schema

const connectionString = (process.env.DATABASE_URL || '').replace(/\?schema=public/, '')
const client = postgres(connectionString, { prepare: false, max: 1 })
const db = drizzle(client, { schema })

async function main() {
  console.log('Starting cleanup...\n')

  // 1. Get all customer company IDs
  const customerCompanies = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.isCustomer, true))
  console.log(`Found ${customerCompanies.length} customer companies`)

  const companyIds = customerCompanies.map((c) => c.id)

  // 2. Get all ticket IDs linked to those companies
  let ticketIds: number[] = []
  if (companyIds.length > 0) {
    const ticketRows = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(inArray(tickets.companyId, companyIds))
    ticketIds = ticketRows.map((t) => t.id)
    console.log(`Found ${ticketIds.length} tickets linked to customer companies`)
  }

  // 3. Delete ticket-related rows (order matters for FK)
  if (ticketIds.length > 0) {
    const del = async (table: string, count: number) => console.log(`  Deleted ${count} rows from ${table}`)

    const r1 = await db.delete(ticketComments).where(inArray(ticketComments.ticketId, ticketIds))
    await del('ticket_comments', r1.count ?? 0)

    const r2 = await db.delete(ticketTags).where(inArray(ticketTags.ticketId, ticketIds))
    await del('ticket_tags', r2.count ?? 0)

    const r3 = await db.delete(ticketTimeTracker).where(inArray(ticketTimeTracker.ticketId, ticketIds))
    await del('ticket_time_tracker', r3.count ?? 0)

    const r4 = await db.delete(ticketChecklist).where(inArray(ticketChecklist.ticketId, ticketIds))
    await del('ticket_checklist', r4.count ?? 0)

    const r5 = await db.delete(ticketAssignees).where(inArray(ticketAssignees.ticketId, ticketIds))
    await del('ticket_assignees', r5.count ?? 0)

    const r6 = await db.delete(ticketAiSummaries).where(inArray(ticketAiSummaries.ticketId, ticketIds))
    await del('ticket_ai_summaries', r6.count ?? 0)

    const r7 = await db.delete(ticketActivityLog).where(inArray(ticketActivityLog.ticketId, ticketIds))
    await del('ticket_activity_log', r7.count ?? 0)

    const r8 = await db.delete(ticketAttachments).where(inArray(ticketAttachments.ticketId, ticketIds))
    await del('ticket_attachments', r8.count ?? 0)

    const r9 = await db.delete(ticketCcRecipients).where(inArray(ticketCcRecipients.ticketId, ticketIds))
    await del('ticket_cc_recipients', r9.count ?? 0)

    const r10 = await db.delete(tickets).where(inArray(tickets.id, ticketIds))
    await del('tickets', r10.count ?? 0)
  }

  // 4. Delete company_users for customer companies
  if (companyIds.length > 0) {
    const r = await db.delete(companyUsers).where(inArray(companyUsers.companyId, companyIds))
    console.log(`  Deleted ${r.count ?? 0} rows from company_users`)
  }

  // 5. Delete customer users + FD agent placeholders
  const r = await db.delete(users).where(eq(users.role, 'customer'))
  console.log(`  Deleted ${r.count ?? 0} customer users`)
  const r5b = await db.delete(users).where(and(eq(users.role, 'agent'), eq(users.status, 'inactive'), like(users.fullName, 'FD - %')))
  console.log(`  Deleted ${r5b.count ?? 0} FD agent placeholder users`)

  // 6. Delete customer companies
  if (companyIds.length > 0) {
    const r2 = await db.delete(companies).where(eq(companies.isCustomer, true))
    console.log(`  Deleted ${r2.count ?? 0} customer companies`)
  }

  console.log('\nCleanup complete.')
  await client.end()
}

main().catch((e) => {
  console.error('Cleanup failed:', e)
  process.exit(1)
})
