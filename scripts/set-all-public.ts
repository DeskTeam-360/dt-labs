import postgres from 'postgres'

const sql = postgres('postgresql://dtlabs:passwordkuIsAman2%21%23%24@3.23.67.169:5432/dtlabs')

async function main() {
  const before = await sql`SELECT visibility, COUNT(*) as count FROM tickets GROUP BY visibility`
  console.log('Before:', before)

  const result = await sql`UPDATE tickets SET visibility = 'public', updated_at = NOW() WHERE visibility != 'public'`
  console.log('Updated rows:', result.count)

  const after = await sql`SELECT visibility, COUNT(*) as count FROM tickets GROUP BY visibility`
  console.log('After:', after)

  await sql.end()
}

main().catch(console.error)
