import postgres from 'postgres'

const sql = postgres('postgresql://dtlabs:passwordkuIsAman2%21%23%24@3.23.67.169:5432/dtlabs')

// Check current sequence value
const seq = await sql`SELECT last_value, is_called FROM tickets_id_seq`
console.log('Sequence last_value:', seq[0])

// Check ticket ID range
const stats = await sql`
  SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as total
  FROM tickets WHERE id > 200000
`
console.log('Stats:', stats[0])

// Show recent tickets
const recent = await sql`
  SELECT id, title, created_at, created_via
  FROM tickets ORDER BY id DESC LIMIT 20
`
console.log('\nRecent 20 tickets:')
recent.forEach(r => console.log(`  #${r.id} | ${String(r.created_via || 'portal').padEnd(8)} | ${r.title?.slice(0,40)}`))

// Check around the gap (202672 vs 20649 - maybe 206xx range?)
const gap = await sql`
  SELECT id FROM tickets WHERE id BETWEEN 200600 AND 203000 ORDER BY id
`
console.log(`\nTickets between 200600-203000: ${gap.length} rows`)
if (gap.length < 30) gap.forEach(r => console.log(`  #${r.id}`))

await sql.end()
