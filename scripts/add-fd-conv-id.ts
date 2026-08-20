import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

async function main() {
  await sql`ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS fd_conversation_id integer`
  console.log('Column added.')
  const rows = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='ticket_comments' ORDER BY ordinal_position`
  console.log(rows.map((x: any) => x.column_name).join(', '))
  await sql.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
