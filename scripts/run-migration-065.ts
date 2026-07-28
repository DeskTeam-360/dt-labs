import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client)

async function main() {
  console.log('Running migration 065...')

  await db.execute(sql`ALTER TABLE ticket_checklist ADD COLUMN IF NOT EXISTS group_name text`)
  console.log('✓ Added group_name to ticket_checklist')

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  console.log('✓ Created checklist_templates')

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS checklist_template_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
      title text NOT NULL,
      order_index integer DEFAULT 0
    )
  `)
  console.log('✓ Created checklist_template_groups')

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS checklist_template_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
      group_id uuid REFERENCES checklist_template_groups(id) ON DELETE SET NULL,
      title text NOT NULL,
      order_index integer DEFAULT 0
    )
  `)
  console.log('✓ Created checklist_template_items')

  console.log('Migration 065 complete.')
  await client.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
