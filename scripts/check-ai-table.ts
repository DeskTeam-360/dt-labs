import postgres from 'postgres'

async function main() {
  const client = postgres(process.env.DATABASE_URL as string)
  const r = await client`SELECT to_regclass('public.ticket_ai_summaries') as tbl`
  console.log(JSON.stringify(r))
  await client.end()
}

main().catch((e) => { console.error(e.message); process.exit(1) })
