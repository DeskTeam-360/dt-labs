/**
 * Jalankan `supabase db push` ke db1 (DATABASE_URL) dan db2 (DATABASE_URL_SECOND).
 *
 * Env (.env lalu .env.local override): DATABASE_URL, DATABASE_URL_SECOND (opsional — yang kosong di-skip)
 *
 * Usage:
 *   node scripts/supabase-db-push-both.cjs
 *   npm run supabase:db:push:both
 */
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
require('dotenv').config({ path: path.join(root, '.env') })
require('dotenv').config({ path: path.join(root, '.env.local'), override: true })

function push(label, dbUrl) {
  if (!dbUrl || !String(dbUrl).trim()) {
    console.log(`[skip] ${label}: no URL`)
    return 0
  }
  const url = String(dbUrl).trim()
  console.log(`\n========== ${label} ==========`)
  const result = spawnSync('npx', ['supabase', 'db', 'push', '--db-url', url, '--yes'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  const code = result.status ?? 1
  if (code !== 0) {
    console.error(`[error] ${label}: exit ${code}`)
  }
  return code
}

function main() {
  let exitCode = 0
  exitCode = Math.max(exitCode, push('db1 (DATABASE_URL)', process.env.DATABASE_URL))
  exitCode = Math.max(exitCode, push('db2 (DATABASE_URL_SECOND)', process.env.DATABASE_URL_SECOND))
  process.exit(exitCode)
}

main()
