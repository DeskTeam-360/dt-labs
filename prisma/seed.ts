/**
 * Seed: ticket_statuses, ticket_types, ticket_priorities, users (Drizzle)
 * Jalankan: npm run db:seed
 *
 * Env:
 *   DATABASE_URL (wajib)
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME — admin default jika SEED_USERS kosong
 *   SEED_USERS — beberapa user: 'email1:pass1:Nama1,email2:pass2:Nama2' (role: user)
 */
import 'dotenv/config'

import { db } from '../lib/db'
import { users, ticketTypes, ticketPriorities, ticketStatuses } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import * as bcrypt from 'bcryptjs'

async function seedTicketStatuses() {
  const existing = await db.select().from(ticketStatuses).limit(1)
  if (existing.length > 0) return

  await db
    .insert(ticketStatuses)
    .values([
      {
        slug: 'to_do',
        title: 'To Do',
        description: '',
        color: '#faad14',
        showInKanban: true,
        sortOrder: 1,
      },
      {
        slug: 'in_progress',
        title: 'In Progress',
        description: '',
        color: '#1890ff',
        showInKanban: true,
        sortOrder: 2,
      },
      {
        slug: 'completed',
        title: 'Completed',
        description: '',
        color: '#52c41a',
        showInKanban: true,
        sortOrder: 3,
      },
      {
        slug: 'cancel',
        title: 'Cancel',
        description: '',
        color: '#ff4d4f',
        showInKanban: false,
        sortOrder: 4,
      },
      {
        slug: 'archived',
        title: 'Archived',
        description: '',
        color: '#8c8c8c',
        showInKanban: false,
        sortOrder: 5,
      },
    ])
    .onConflictDoNothing({ target: ticketStatuses.slug })

  console.log('Created ticket_statuses: to_do, in_progress, completed, cancel, archived')
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
