import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import postgres from 'postgres'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = postgres(process.env.DATABASE_URL || 'postgresql://dtlabs:passwordkuIsAman2%21%23%24@3.23.67.169:5432/dtlabs')
const migration = readFileSync(join(__dirname, '../drizzle/migrations/053_ai_settings.sql'), 'utf8')

try {
  await sql.unsafe(migration)
  console.log('Migration 053_ai_settings: OK')
} catch (e) {
  console.error('Error:', e.message)
} finally {
  await sql.end()
}
