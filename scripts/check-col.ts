import postgres from 'postgres'

const url = process.env.DATABASE_URL!
const sql = postgres(url)

sql`SELECT column_name FROM information_schema.columns WHERE table_name='ticket_comments' ORDER BY ordinal_position`
  .then(r => { console.log(r.map((x: any) => x.column_name).join(', ')); return sql.end() })
  .catch(e => { console.error(e.message); process.exit(1) })
