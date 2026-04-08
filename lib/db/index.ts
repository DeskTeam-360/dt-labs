import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Strip ?schema=public from DATABASE_URL (postgres.js doesn't support it)
function getConnectionString() {
  const url = process.env.DATABASE_URL || ''
  const idx = url.indexOf('?')
  if (idx <= 0) return url
  const params = url.slice(idx + 1).split('&').filter((p) => !p.startsWith('schema='))
  return url.slice(0, idx) + (params.length ? '?' + params.join('&') : '')
}

const connectionString = getConnectionString()

// Default pool: avoid queuing when many API routes hit DB in parallel (max: 3 often felt “stuck”).
const poolMax = Math.min(50, Math.max(3, Number(process.env.DATABASE_POOL_MAX) || 15))
const client = postgres(connectionString, { prepare: false, max: poolMax })

export const db = drizzle(client, { schema })
