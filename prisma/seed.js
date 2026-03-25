/**
 * Legacy entry: mendelegasikan ke prisma/seed.ts (Drizzle).
 * Disarankan: npm run db:seed
 */
require('dotenv').config()
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const r = spawnSync('npx', ['tsx', 'prisma/seed.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
})
process.exit(r.status === 0 ? 0 : r.status || 1)
