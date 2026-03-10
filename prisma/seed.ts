/**
 * Seed: membuat user admin pertama dengan password
 * Jalankan: npm run db:seed
 *
 * Atau manual:
 * npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123'
  const fullName = process.env.SEED_ADMIN_NAME || 'Admin'

  const existing = await prisma.users.findUnique({
    where: { email },
  })

  if (existing) {
    console.log('User already exists:', email)
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)

  await prisma.users.create({
    data: {
      email,
      password_hash: passwordHash,
      full_name: fullName,
      role: 'admin',
      status: 'active',
    },
  })

  console.log('Created admin user:', email)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
