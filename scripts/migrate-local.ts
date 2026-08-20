import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

async function main() {
  await sql`ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS fd_conversation_id integer`
  await sql`ALTER TABLE ticket_comments ADD CONSTRAINT IF NOT EXISTS ticket_comments_fd_conversation_id_unique UNIQUE (fd_conversation_id)`.catch(() => {})
  await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS source varchar(32)`
  await sql`DROP INDEX IF EXISTS tickets_support_company_priority_unique`
  console.log('Local migration done.')
  await sql.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
