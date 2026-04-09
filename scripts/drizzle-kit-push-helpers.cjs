const path = require('path')
const { spawnSync } = require('child_process')

function loadEnv(root) {
  require('dotenv').config({ path: path.join(root, '.env') })
  require('dotenv').config({ path: path.join(root, '.env.local'), override: true })
}

/**
 * @returns {number} exit code (0 = ok)
 */
function drizzlePush(root, label, dbUrl) {
  if (!dbUrl || !String(dbUrl).trim()) {
    console.log(`[skip] ${label}: no URL`)
    return 0
  }
  const url = String(dbUrl).trim()
  console.log(`\n========== ${label} ==========`)

  const env = { ...process.env, DATABASE_URL: url }
  const args = ['drizzle-kit', 'push']
  if (process.env.DRIZZLE_PUSH_FORCE === '1' || process.env.DRIZZLE_PUSH_FORCE === 'true') {
    args.push('--force')
    console.log('[info] DRIZZLE_PUSH_FORCE — drizzle-kit push --force')
  }

  const interactive =
    process.env.DRIZZLE_PUSH_INTERACTIVE === '1' || process.env.DRIZZLE_PUSH_INTERACTIVE === 'true'

  const result = spawnSync('npx', args, {
    cwd: root,
    stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env,
    shell: process.platform === 'win32',
    encoding: interactive ? undefined : 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  })

  if (!interactive) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }

  const code = result.status ?? 1
  if (code !== 0) {
    console.error(`[error] ${label}: exit ${code}`)
  }
  return code
}

module.exports = { loadEnv, drizzlePush }
