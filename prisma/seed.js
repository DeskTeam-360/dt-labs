/**
 * Seed: membuat user admin ke PostgreSQL (Supabase/database)
 * Jalankan: npm run db:seed
 *
 * Env (optional):
 *   SEED_ADMIN_EMAIL    - default: admin@example.com
 *   SEED_ADMIN_PASSWORD - default: admin123
 *   SEED_ADMIN_NAME     - default: Admin
 *
 * Multiple users: SEED_USERS='email1:password1:name1,email2:password2:name2'
 */
require('dotenv').config()

const postgres = require('postgres')
const bcrypt = require('bcryptjs')

function parseConnectionString(url) {
  if (!url) throw new Error('DATABASE_URL is required')
  const idx = url.indexOf('?')
  if (idx > 0) {
    const params = url.slice(idx + 1).split('&').filter((p) => !p.startsWith('schema='))
    return url.slice(0, idx) + (params.length ? '?' + params.join('&') : '')
  }
  return url
}

async function main() {
  const connectionString = parseConnectionString(process.env.DATABASE_URL)
  const sql = postgres(connectionString)

  const usersToSeed = []
  const seedUsers = process.env.SEED_USERS
  if (seedUsers) {
    for (const part of seedUsers.split(',')) {
      const [email, password, name] = part.trim().split(':')
      if (email) {
        usersToSeed.push({
          email: email.trim(),
          password: (password || 'admin123').trim(),
          fullName: (name || email.split('@')[0]).trim(),
          role: 'user',
        })
      }
    }
  }
  if (usersToSeed.length === 0) {
    usersToSeed.push({
      email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
      fullName: process.env.SEED_ADMIN_NAME || 'Admin',
      role: 'admin',
    })
  }

  for (const u of usersToSeed) {
    const existing = await sql`SELECT id FROM users WHERE email = ${u.email} LIMIT 1`
    if (existing.length > 0) {
      console.log('User already exists:', u.email)
      continue
    }

    const passwordHash = await bcrypt.hash(u.password, 10)

    await sql`
      INSERT INTO users (id, email, password_hash, full_name, role, status)
      VALUES (gen_random_uuid(), ${u.email}, ${passwordHash}, ${u.fullName}, ${u.role}, 'active')
    `
    console.log('Created user:', u.email, `(role: ${u.role})`)
  }

  await sql.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
