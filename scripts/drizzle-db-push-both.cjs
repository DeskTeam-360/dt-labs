/**
 * `drizzle-kit push` ke db1 (DATABASE_URL) lalu db2 (DATABASE_URL_SECOND).
 * Lihat `drizzle-kit-push-helpers.cjs` untuk DRIZZLE_PUSH_INTERACTIVE / DRIZZLE_PUSH_FORCE.
 *
 * Usage: npm run db:push:both
 */
const path = require('path')
const { loadEnv, drizzlePush } = require('./drizzle-kit-push-helpers.cjs')

const root = path.join(__dirname, '..')
loadEnv(root)

let exitCode = 0
exitCode = Math.max(exitCode, drizzlePush(root, 'db1 (DATABASE_URL)', process.env.DATABASE_URL))
exitCode = Math.max(exitCode, drizzlePush(root, 'db2 (DATABASE_URL_SECOND)', process.env.DATABASE_URL_SECOND))
process.exit(exitCode)
