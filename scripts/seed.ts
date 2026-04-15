/**
 * Seed: ticket_statuses, ticket_types, ticket_priorities, users (Drizzle)
 * Run: npm run db:seed
 *
 * Env:
 *   DATABASE_URL (required)
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME — default admin when SEED_USERS is empty
 *   SEED_USERS — extra users: 'email1:pass1:Name1,email2:pass2:Name2' (role: user)
 */
import 'dotenv/config'

import { db } from '../lib/db'
import { users, ticketTypes, ticketPriorities, ticketStatuses } from '../lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import * as bcrypt from 'bcryptjs'

/**
 * Replaces all ticket_statuses rows. Colors follow the settings palette (#F1C232, #D9EAD3, …).
 * All rows are is_deletable = false so they cannot be removed from the API/UI.
 */
async function seedTicketStatuses() {
  await db.execute(sql`TRUNCATE TABLE ticket_statuses RESTART IDENTITY`)

  await db.insert(ticketStatuses).values([
    {
      slug: 'open',
      title: 'Open',
      customerTitle: 'Ticket received',
      description: 'Ticket has been received and is in the queue.',
      color: '#F1C232',
      showInKanban: true,
      sortOrder: 1,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'received',
      title: 'Received',
      customerTitle: "We've seen your request",
      description: 'Our team has acknowledged your request.',
      color: '#C9DAF8',
      showInKanban: true,
      sortOrder: 2,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'question',
      title: 'Question',
      customerTitle: 'Waiting for your reply',
      description: "We're waiting for information from you.",
      color: '#6D9EEB',
      showInKanban: true,
      sortOrder: 3,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'working_team',
      title: 'Working Team',
      customerTitle: "We're working on it",
      description: 'We are actively working on this ticket.',
      color: '#D9EAD3',
      showInKanban: true,
      sortOrder: 4,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'am_review',
      title: 'AM Review',
      customerTitle: "We're reviewing internally",
      description: 'Under internal review before the next customer update.',
      color: '#6D9EEB',
      showInKanban: true,
      sortOrder: 5,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'client_review',
      title: 'Client Review',
      customerTitle: 'Ready for your review',
      description: 'Please review our work and share feedback.',
      color: '#52c41a',
      showInKanban: true,
      sortOrder: 6,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'feedback_received',
      title: 'Feedback Received',
      customerTitle: "We've received your feedback",
      description: 'We have received your feedback.',
      color: '#C9DAF8',
      showInKanban: true,
      sortOrder: 7,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'revision',
      title: 'Revision',
      customerTitle: 'Working on your revision',
      description: 'Implementing changes based on your feedback.',
      color: '#1890ff',
      showInKanban: true,
      sortOrder: 8,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'pending',
      title: 'Pending',
      customerTitle: 'Temporarily paused',
      description: 'Work on this ticket is temporarily paused.',
      color: '#8c8c8c',
      showInKanban: false,
      sortOrder: 9,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'resolved',
      title: 'Resolved',
      customerTitle: 'All done!',
      description: 'The work is complete from our side.',
      color: '#52c41a',
      showInKanban: false,
      sortOrder: 10,
      isDeletable: false,
      isActive: true,
    },
    {
      slug: 'closed',
      title: 'Closed',
      customerTitle: 'All done!',
      description: 'This ticket is closed.',
      color: '#595959',
      showInKanban: false,
      sortOrder: 11,
      isDeletable: false,
      isActive: true,
    },
  ])

  console.log(
    'Replaced ticket_statuses: open → closed (11 rows, is_deletable=false, colors from palette)'
  )
}

async function seedTicketTypes() {
  const typesCount = await db.select().from(ticketTypes).limit(1)
  if (typesCount.length > 0) return

  await db
    .insert(ticketTypes)
    .values([
      { slug: 'bug', title: 'Bug', color: '#ff4d4f', sortOrder: 1 },
      { slug: 'feature', title: 'Feature', color: '#52c41a', sortOrder: 2 },
      { slug: 'task', title: 'Task', color: '#1890ff', sortOrder: 3 },
      { slug: 'support', title: 'Support', color: '#fa8c16', sortOrder: 4 },
    ])
    .onConflictDoNothing({ target: ticketTypes.slug })

  console.log('Created ticket_types: bug, feature, task, support')
}

async function seedTicketPriorities() {
  const prioritiesCount = await db.select().from(ticketPriorities).limit(1)
  if (prioritiesCount.length > 0) return

  await db
    .insert(ticketPriorities)
    .values([
      { slug: 'urgent', title: 'Urgent', color: '#ff4d4f', sortOrder: 1 },
      { slug: 'high', title: 'High', color: '#fa8c16', sortOrder: 2 },
      { slug: 'medium', title: 'Medium', color: '#1890ff', sortOrder: 3 },
      { slug: 'low', title: 'Low', color: '#8c8c8c', sortOrder: 4 },
    ])
    .onConflictDoNothing({ target: ticketPriorities.slug })

  console.log('Created ticket_priorities: urgent, high, medium, low')
}

type SeedUserRow = {
  email: string
  password: string
  fullName: string
  role: string
}

function buildUsersToSeed(): SeedUserRow[] {
  const list: SeedUserRow[] = []
  const seedUsers = process.env.SEED_USERS
  if (seedUsers) {
    for (const part of seedUsers.split(',')) {
      const [email, password, name] = part.trim().split(':')
      if (email) {
        list.push({
          email: email.trim(),
          password: (password || 'admin123').trim(),
          fullName: (name || email.split('@')[0]).trim(),
          role: 'user',
        })
      }
    }
  }
  if (list.length === 0) {
    list.push({
      email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
      fullName: process.env.SEED_ADMIN_NAME || 'Admin',
      role: 'admin',
    })
  }
  return list
}

async function seedUsers() {
  const rows = buildUsersToSeed()

  for (const u of rows) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, u.email))
      .limit(1)

    if (existing) {
      console.log('User already exists:', u.email)
      continue
    }

    const passwordHash = await bcrypt.hash(u.password, 10)

    await db.insert(users).values({
      email: u.email,
      passwordHash,
      fullName: u.fullName,
      role: u.role,
      status: 'active',
    })

    console.log('Created user:', u.email, `(role: ${u.role})`)
  }
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required (set in .env)')
  }

  await seedTicketStatuses()
  await seedTicketTypes()
  await seedTicketPriorities()
  await seedUsers()
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
