#!/usr/bin/env node
/**
 * Run migration: todo_ tables -> ticket_
 * Works on Windows (no psql required)
 */
require('dotenv').config()
const postgres = require('postgres')
const { readFileSync } = require('fs')
const { join } = require('path')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Error: DATABASE_URL not set in .env')
  process.exit(1)
}

// Strip ?schema=public (postgres.js doesn't support it)
const connUrl = url.includes('?') ? url.replace(/\?schema=public&?|&?schema=public&?/g, '') : url

const sql = postgres(connUrl, { max: 1 })

async function run() {
  const sqlPath = join(__dirname, '..', 'drizzle', 'migrations', '001_rename_todo_tables_to_ticket.sql')
  const sqlContent = readFileSync(sqlPath, 'utf-8')

  // Remove BEGIN/COMMIT - we'll use sql.begin()
  const content = sqlContent
    .replace(/^\s*BEGIN\s*;\s*\n?/i, '')
    .replace(/\n?\s*COMMIT\s*;?\s*$/i, '')
    .trim()

  console.log('Running migration: todo_ -> ticket_')
  await sql.begin(async (sql) => {
    await sql.unsafe(content)
  })
  console.log('Migration completed successfully.')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => sql.end())
