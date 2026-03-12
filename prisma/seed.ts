/**
 * Seed: user admin + ticket_types + ticket_priorities (Drizzle)
 * Jalankan: npx tsx prisma/seed.ts
 *
 * Env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
import 'dotenv/config'

import { db, users, ticketTypes, ticketPriorities } from '@/lib/db'
import { eq } from 'drizzle-orm'
import * as bcrypt from 'bcryptjs'

async function main() {
  // Seed ticket_types (jika kosong)
  const typesCount = await db.select().from(ticketTypes).limit(1)
  if (typesCount.length === 0) {
    await db.insert(ticketTypes).values([
      { slug: 'bug', title: 'Bug', color: '#ff4d4f', sortOrder: 1 },
      { slug: 'feature', title: 'Feature', color: '#52c41a', sortOrder: 2 },
      { slug: 'task', title: 'Task', color: '#1890ff', sortOrder: 3 },
      { slug: 'support', title: 'Support', color: '#fa8c16', sortOrder: 4 },
    ])
    console.log('Created ticket_types: bug, feature, task, support')
  }

  // Seed ticket_priorities (jika kosong)
  const prioritiesCount = await db.select().from(ticketPriorities).limit(1)
  if (prioritiesCount.length === 0) {
    await db.insert(ticketPriorities).values([
      { slug: 'urgent', title: 'Urgent', color: '#ff4d4f', sortOrder: 1 },
      { slug: 'high', title: 'High', color: '#fa8c16', sortOrder: 2 },
      { slug: 'medium', title: 'Medium', color: '#1890ff', sortOrder: 3 },
      { slug: 'low', title: 'Low', color: '#8c8c8c', sortOrder: 4 },
    ])
    console.log('Created ticket_priorities: urgent, high, medium, low')
  }

  // Seed admin user
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123'
  const fullName = process.env.SEED_ADMIN_NAME || 'Admin'

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing) {
    console.log('User already exists:', email)
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)

  await db.insert(users).values({
    email,
    passwordHash,
    fullName,
    role: 'admin',
    status: 'active',
  })

  console.log('Created admin user:', email)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => {
    process.exit(0)
  })
