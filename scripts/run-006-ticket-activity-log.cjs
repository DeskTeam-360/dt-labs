/**
 * Apply drizzle/migrations/006_create_ticket_activity_log.sql to DATABASE_URL and DATABASE_URL_SECOND.
 * Usage: node scripts/run-006-ticket-activity-log.cjs
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

/** Split on `;` outside single-quoted strings (handles `;` inside COMMENT … IS '…'). */
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

async function runOn(name, connectionString) {
  if (!connectionString?.trim()) {
    console.log(`[skip] ${name}: no URL`)
    return
  }
  const sql = postgres(stripSchemaParam(connectionString), { max: 1 })
  const filePath = path.join(__dirname, '../drizzle/migrations/006_create_ticket_activity_log.sql')
  const raw = fs.readFileSync(filePath, 'utf8')
  const statements = splitSqlStatements(raw)
  try {
    for (const stmt of statements) {
      await sql.unsafe(stmt)
    }
    console.log(`[ok] ${name}`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function main() {
  await runOn('db1 (DATABASE_URL)', process.env.DATABASE_URL)
  await runOn('db2 (DATABASE_URL_SECOND)', process.env.DATABASE_URL_SECOND)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
