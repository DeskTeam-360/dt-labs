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

const client = postgres(connectionString, { prepare: false })

export const db = drizzle(client, { schema })
