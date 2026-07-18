/**
 * `drizzle-kit push` hanya ke DATABASE_URL (db1). Sama seperti `npm run db:push:both` tapi satu DB.
 * Usage: npm run db:push
 */
const path = require('path')
const { loadEnv, drizzlePush } = require('./drizzle-kit-push-helpers.cjs')

const root = path.join(__dirname, '..')
loadEnv(root)

process.exit(drizzlePush(root, 'db1 (DATABASE_URL)', process.env.DATABASE_URL))
