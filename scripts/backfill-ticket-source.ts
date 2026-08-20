import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

async function main() {
  const r = await sql`UPDATE tickets SET source = 'freshdesk' WHERE created_via = 'freshdesk' AND source IS NULL`
  console.log(`Updated ${r.count} tickets.`)
  await sql.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
