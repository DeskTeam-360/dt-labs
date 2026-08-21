import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

async function main() {
  const statuses = ['revision', 'feedback_received']

  for (const status of statuses) {
    const rows = await sql`
      SELECT
        t.id,
        t.title,
        t.status,
        t.updated_at,
        c.name AS company,
        u.full_name AS contact
      FROM tickets t
      LEFT JOIN companies c ON c.id = t.company_id
      LEFT JOIN users u ON u.id = t.contact_user_id
      WHERE t.status = ${status}
      ORDER BY t.updated_at DESC
    `
    console.log(`\n=== Status: ${status} (${rows.length} tickets) ===`)
    if (rows.length === 0) {
      console.log('  (none)')
    } else {
      for (const r of rows) {
        console.log(`  #${r.id} | ${r.title} | ${r.company ?? '-'} | ${r.contact ?? '-'} | updated: ${r.updated_at}`)
      }
    }
  }

  await sql.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
