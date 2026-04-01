/**
 * Jalankan satu file SQL migrasi ke db1 (DATABASE_URL) dan db2 (DATABASE_URL_SECOND).
 *
 * Usage:
 *   node scripts/run-migration-both-dbs.cjs drizzle/migrations/008_message_templates.sql
 *   npm run db:migrate:both -- drizzle/migrations/008_message_templates.sql
 *
 * Env (.env): DATABASE_URL, DATABASE_URL_SECOND (opsional — yang kosong di-skip)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const fs = require('fs')
const path = require('path')
const postgres = require('postgres')

function stripSchemaParam(url) {
  if (!url) return url
  const idx = url.indexOf('?')
  if (idx <= 0) return url
  const params = url.slice(idx + 1).split('&').filter((p) => !p.startsWith('schema='))
  return url.slice(0, idx) + (params.length ? '?' + params.join('&') : '')
}

/** Split on `;` outside single-quoted strings. */
function splitSqlStatements(raw) {
  const noLineComments = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const out = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < noLineComments.length; i++) {
    const c = noLineComments[i]
    if (c === "'" && noLineComments[i - 1] !== '\\') inQuote = !inQuote
    cur += c
    if (!inQuote && c === ';') {
      const t = cur.trim()
      if (t) out.push(t)
      cur = ''
    }
  }
  const tail = cur.trim()
  if (tail) out.push(tail)
  return out.filter((s) => s.length > 1)
}

async function runOn(name, connectionString, filePath) {
  if (!connectionString?.trim()) {
    console.log(`[skip] ${name}: no URL`)
    return
  }
  const sql = postgres(stripSchemaParam(connectionString), { max: 1 })
  const raw = fs.readFileSync(filePath, 'utf8')
  const statements = splitSqlStatements(raw)
  try {
    for (const stmt of statements) {
      await sql.unsafe(stmt)
    }
    console.log(`[ok] ${name} (${statements.length} statement(s))`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: node scripts/run-migration-both-dbs.cjs <path-to.sql>')
    console.error('Example: node scripts/run-migration-both-dbs.cjs drizzle/migrations/008_message_templates.sql')
    process.exit(1)
  }
  const filePath = path.isAbsolute(arg) ? arg : path.join(__dirname, '..', arg)
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath)
    process.exit(1)
  }

  console.log('Migration file:', filePath)
  await runOn('db1 (DATABASE_URL)', process.env.DATABASE_URL, filePath)
  await runOn('db2 (DATABASE_URL_SECOND)', process.env.DATABASE_URL_SECOND, filePath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
