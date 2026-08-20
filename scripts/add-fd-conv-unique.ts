import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

async function main() {
  await sql`ALTER TABLE ticket_comments ADD CONSTRAINT ticket_comments_fd_conversation_id_unique UNIQUE (fd_conversation_id)`
  console.log('Unique constraint added.')
  await sql.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
