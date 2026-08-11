import 'dotenv/config'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '../lib/db/schema'

const client = postgres((process.env.DATABASE_URL || '').replace(/\?schema=public/, ''), { prepare: false, max: 1 })
const db = drizzle(client, { schema })

async function main() {
  // Get a real admin user id
  const [admin] = await client`SELECT id FROM users WHERE role = 'admin' LIMIT 1`
  const [company] = await client`SELECT id FROM companies LIMIT 1`

  if (!admin) { console.log('No admin user found'); await client.end(); return }
  if (!company) { console.log('No company found'); await client.end(); return }

  console.log('admin id:', admin.id)
  console.log('company id:', company.id)

  try {
    await db.execute(sql`
      INSERT INTO tickets (
        id, title, description, original_description,
        status, priority, company_id,
        contact_user_id, created_by,
        created_via,
        created_at, updated_at
      )
      OVERRIDING SYSTEM VALUE
      VALUES (
        ${99999},
        ${'Test ticket from Freshdesk import'},
        ${'<p>test description</p>'},
        ${'test description'},
        ${'open'},
        ${null},
        ${company.id}::uuid,
        ${null}::uuid,
        ${admin.id}::uuid,
        ${'freshdesk'},
        ${new Date().toISOString()}::timestamptz,
        ${new Date().toISOString()}::timestamptz
      )
    `)
    console.log('INSERT succeeded!')

    // Cleanup
    await client`DELETE FROM tickets WHERE id = 99999`
    console.log('Cleaned up test ticket')
  } catch (e) {
    console.error('INSERT failed:', e)
  }

  await client.end()
}

main().catch(console.error)
