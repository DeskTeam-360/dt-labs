/**
 * Jalankan `drizzle-kit push` ke db1 (DATABASE_URL) dan db2 (DATABASE_URL_SECOND).
 *
 * Env (.env lalu .env.local override): DATABASE_URL, DATABASE_URL_SECOND (opsional — yang kosong di-skip)
 *
 * Usage:
 *   node scripts/drizzle-db-push-both.cjs
 *   npm run db:push:both
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
  const env = { ...process.env, DATABASE_URL: url }
  const result = spawnSync('npx', ['drizzle-kit', 'push'], {
    cwd: root,
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
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
