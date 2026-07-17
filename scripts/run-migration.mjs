import 'dotenv/config'

import { readFileSync } from 'fs'
import { dirname, isAbsolute, join } from 'path'
import postgres from 'postgres'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const arg = process.argv[2]
if (!arg) {
  console.error('Usage: node scripts/run-migration.mjs <migration-file.sql>')
  console.error('Example: node scripts/run-migration.mjs 063_ticket_audience_last_read.sql')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Add it to .env / .env.local or the environment.')
  process.exit(1)
}

// Accept either a bare filename (resolved under drizzle/migrations) or an explicit path.
const migrationPath = isAbsolute(arg)
  ? arg
  : arg.includes('/') || arg.includes('\\')
    ? join(process.cwd(), arg)
    : join(__dirname, '../drizzle/migrations', arg)

const migration = readFileSync(migrationPath, 'utf8')
const sql = postgres(connectionString)

try {
  await sql.unsafe(migration)
  console.log(`Migration OK: ${arg}`)
} catch (e) {
  console.error('Migration failed:', e.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
