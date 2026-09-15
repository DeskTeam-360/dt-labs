import { sql } from 'drizzle-orm'

import { db } from '../lib/db/index'

async function main() {
  await db.execute(sql`
    ALTER TABLE ticket_comments
      ADD COLUMN IF NOT EXISTS edited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS edited_at timestamp
  `)
  console.log('Migration done: added edited_by_user_id, edited_at to ticket_comments')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
