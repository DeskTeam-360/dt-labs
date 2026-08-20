import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

async function main() {
  await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS source varchar(32)`
  console.log('Column tickets.source added.')
  await sql.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
