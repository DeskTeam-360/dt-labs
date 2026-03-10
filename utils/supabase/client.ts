/** @deprecated Supabase is no longer used - project migrated to PostgreSQL. Remove imports and use API/fetch instead. */
export function createClient(): never {
  throw new Error(
    'Supabase is no longer used. This component needs to be migrated to use PostgreSQL API. Use fetch() to /api/* endpoints instead.'
  )
}

