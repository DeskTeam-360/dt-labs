/**
 * `drizzle-kit push` hanya ke DATABASE_URL_SECOND (db2).
 * Usage: npm run db:push:second
 */
const path = require('path')
const { loadEnv, drizzlePush } = require('./drizzle-kit-push-helpers.cjs')

const root = path.join(__dirname, '..')
loadEnv(root)

const url = process.env.DATABASE_URL_SECOND
if (!url?.trim()) {
  console.error('[error] DATABASE_URL_SECOND is not set')
  process.exit(1)
}

process.exit(drizzlePush(root, 'db2 (DATABASE_URL_SECOND)', url))
