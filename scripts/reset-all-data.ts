/**
 * Full reset script — wipes all user/team/company/ticket data
 * and resets ticket sequence to 200000.
 *
 * Preserved: seed users (admin@example.com + testteam*@deskteam360.com + mokhamadasif@gmail.com)
 *
 * Run: npx tsx scripts/reset-all-data.ts
 */
import 'dotenv/config'

import { and, eq, like, notInArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '../lib/db/schema'

const {
  companies,
  companyDatas,
  companyUsers,
  companyWebsites,
  teamMembers,
  teams,
  ticketActivityLog,
  ticketAiSummaries,
  ticketAssignees,
  ticketAttachments,
  ticketCcRecipients,
  ticketChecklist,
  ticketComments,
  ticketTags,
  ticketTimeTracker,
  tickets,
  users,
} = schema

const connectionString = (process.env.DATABASE_URL || '').replace(/\?schema=public/, '')
const client = postgres(connectionString, { prepare: false, max: 1 })
const db = drizzle(client, { schema })

// Emails to preserve (seed / owner accounts)
const PRESERVED_EMAILS = [
  'admin@example.com',
  'mokhamadasif@gmail.com',
  'testteam1-1@deskteam360.com',
  'testteam2-1@deskteam360.com',
  'testteam1-2@deskteam360.com',
  'testteam2-2@deskteam360.com',
]

async function main() {
  console.log('Starting full reset...\n')

  // ── 1. Tickets (all) ─────────────────────────────────────────────────
  const allTickets = await db.select({ id: tickets.id }).from(tickets)
  const ticketIds = allTickets.map((t) => t.id)
  console.log(`Found ${ticketIds.length} tickets`)

  if (ticketIds.length > 0) {
    const r1 = await db.delete(ticketComments).where(notInArray(ticketComments.ticketId, []))
    console.log(`  Deleted ${r1.count ?? 0} ticket_comments`)
    const r2 = await db.delete(ticketTags).where(notInArray(ticketTags.ticketId, []))
    console.log(`  Deleted ${r2.count ?? 0} ticket_tags`)
    const r3 = await db.delete(ticketTimeTracker).where(notInArray(ticketTimeTracker.ticketId, []))
    console.log(`  Deleted ${r3.count ?? 0} ticket_time_tracker`)
    const r4 = await db.delete(ticketChecklist).where(notInArray(ticketChecklist.ticketId, []))
    console.log(`  Deleted ${r4.count ?? 0} ticket_checklist`)
    const r5 = await db.delete(ticketAssignees).where(notInArray(ticketAssignees.ticketId, []))
    console.log(`  Deleted ${r5.count ?? 0} ticket_assignees`)
    const r6 = await db.delete(ticketAiSummaries).where(notInArray(ticketAiSummaries.ticketId, []))
    console.log(`  Deleted ${r6.count ?? 0} ticket_ai_summaries`)
    const r7 = await db.delete(ticketActivityLog).where(notInArray(ticketActivityLog.ticketId, []))
    console.log(`  Deleted ${r7.count ?? 0} ticket_activity_log`)
    const r8 = await db.delete(ticketAttachments).where(notInArray(ticketAttachments.ticketId, []))
    console.log(`  Deleted ${r8.count ?? 0} ticket_attachments`)
    const r9 = await db.delete(ticketCcRecipients).where(notInArray(ticketCcRecipients.ticketId, []))
    console.log(`  Deleted ${r9.count ?? 0} ticket_cc_recipients`)
    const r10 = await db.delete(tickets)
    console.log(`  Deleted ${r10.count ?? 0} tickets`)
  }

  // ── 2. Reset ticket ID sequence to 200000 ────────────────────────────
  await client`SELECT setval(pg_get_serial_sequence('tickets','id'), 199999, true)`
  console.log('\n  Ticket sequence reset → next ID will be 200000')

  // ── 3. Companies (all) ───────────────────────────────────────────────
  const allCompanies = await db.select({ id: companies.id }).from(companies)
  const companyIds = allCompanies.map((c) => c.id)
  console.log(`\nFound ${companyIds.length} companies`)

  if (companyIds.length > 0) {
    const r1 = await db.delete(companyDatas)
    console.log(`  Deleted ${r1.count ?? 0} company_datas`)
    const r2 = await db.delete(companyWebsites)
    console.log(`  Deleted ${r2.count ?? 0} company_websites`)
    const r3 = await db.delete(companyUsers)
    console.log(`  Deleted ${r3.count ?? 0} company_users`)
    const r4 = await db.delete(companies)
    console.log(`  Deleted ${r4.count ?? 0} companies`)
  }

  // ── 4. Teams (all) ───────────────────────────────────────────────────
  const allTeams = await db.select({ id: teams.id }).from(teams)
  console.log(`\nFound ${allTeams.length} teams`)
  if (allTeams.length > 0) {
    const r1 = await db.delete(teamMembers)
    console.log(`  Deleted ${r1.count ?? 0} team_members`)
    const r2 = await db.delete(teams)
    console.log(`  Deleted ${r2.count ?? 0} teams`)
  }

  // ── 5. Users (except preserved) ─────────────────────────────────────
  const preservedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(notInArray(users.email, PRESERVED_EMAILS))
  console.log(`\nFound ${preservedUsers.length} users to delete`)

  // Clear tables that FK-reference users before deleting users
  await client`DELETE FROM customer_time_report_defaults`
  console.log('  Cleared customer_time_report_defaults')

  // Delete customers
  const rCust = await db
    .delete(users)
    .where(and(eq(users.role, 'customer'), notInArray(users.email, PRESERVED_EMAILS)))
  console.log(`  Deleted ${rCust.count ?? 0} customer users`)

  // Delete FD agent placeholders
  const rAgent = await db
    .delete(users)
    .where(and(eq(users.role, 'agent'), eq(users.status, 'inactive'), like(users.fullName, 'FD - %')))
  console.log(`  Deleted ${rAgent.count ?? 0} FD agent placeholder users`)

  // Delete any remaining non-preserved users (staff/manager/agent not in preserved list)
  const rOther = await db.delete(users).where(notInArray(users.email, PRESERVED_EMAILS))
  console.log(`  Deleted ${rOther.count ?? 0} other users`)

  // ── 6. Summary ───────────────────────────────────────────────────────
  const remaining = await db.select({ email: users.email, role: users.role }).from(users)
  console.log(`\nPreserved users (${remaining.length}):`)
  for (const u of remaining) console.log(`  - ${u.email} (${u.role})`)

  console.log('\nReset complete.')
  await client.end()
}

main().catch((e) => {
  console.error('Reset failed:', e)
  process.exit(1)
})
