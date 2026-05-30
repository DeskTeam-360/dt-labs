import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
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
const defaultPoolMax = isServerless ? 1 : process.env.NODE_ENV === 'development' ? 2 : POOL_MAX_CAP
const poolMax =
  Number.isFinite(envPool) && envPool > 0
    ? Math.min(POOL_MAX_CAP, Math.max(1, envPool))
    : defaultPoolMax

type Schema = typeof schema

const globalForDb = globalThis as typeof globalThis & {
  __deskteamPostgres?: ReturnType<typeof postgres>
  __deskteamDrizzle?: PostgresJsDatabase<Schema>
}

function createPostgresClient() {
  return postgres(connectionString, {
    prepare: false,
    max: poolMax,
    idle_timeout: isServerless ? 20 : 30,
    max_lifetime: isServerless ? 60 * 30 : 60 * 10,
  })
}

/** Reuse one client in dev — HMR otherwise opens new pools until Postgres rejects connections (53300). */
const client = globalForDb.__deskteamPostgres ?? createPostgresClient()
if (process.env.NODE_ENV !== 'production') {
  globalForDb.__deskteamPostgres = client
}

export const db = globalForDb.__deskteamDrizzle ?? drizzle(client, { schema })
if (process.env.NODE_ENV !== 'production') {
  globalForDb.__deskteamDrizzle = db
}
