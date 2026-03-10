/** @deprecated Supabase is no longer used - project migrated to PostgreSQL. Remove imports and use auth() + db instead. */
export function createClient(_cookieStore?: unknown): never {
  throw new Error(
    'Supabase is no longer used. This code needs to be migrated to use PostgreSQL (auth() + db from @/lib/db).'
  )
}

