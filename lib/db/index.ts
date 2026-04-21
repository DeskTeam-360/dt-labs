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

/** Vercel/serverless: each isolate is short-lived but many run at once — DB has a global connection cap (e.g. Supabase ~15–60). */
const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME != null

/** Hard cap — keep total client connections low (e.g. Supabase pooler limits). */
const POOL_MAX_CAP = 5

const envPool = Number(process.env.DATABASE_POOL_MAX)
const defaultPoolMax = isServerless ? 1 : POOL_MAX_CAP
const poolMax =
  Number.isFinite(envPool) && envPool > 0
    ? Math.min(POOL_MAX_CAP, Math.max(1, envPool))
    : defaultPoolMax

const client = postgres(connectionString, {
  prepare: false,
  max: poolMax,
  // Return slots to the DB when a lambda goes quiet between invocations.
  ...(isServerless ? { idle_timeout: 20, max_lifetime: 60 * 30 } : {}),
})

export const db = drizzle(client, { schema })
