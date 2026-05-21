/**
 * Admin-only helpers for diagnosing / repairing the `job_types` catalog (time tracker).
 * Uses Drizzle `db.execute` — same pooled connection as the app.
 */
import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'

function rowsFromExecute<T extends Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (
    result &&
    typeof result === 'object' &&
    'rows' in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows
  }
  return Array.from(result as Iterable<T>)
}

export type JobTypesCatalogDiagnostics = {
  ok: boolean
  current_user: string | null
  session_user?: string | null
  /** Table owner login name */
  owner: string | null
  schema_usage_public: boolean
  select_job_types: boolean
  /** null if missing */
  row_count: number | null
  /** Row-level security on job_types */
  rls_enabled: boolean | null
  messages: string[]
}

export async function getJobTypesCatalogDiagnostics(): Promise<JobTypesCatalogDiagnostics> {
  const messages: string[] = []

  const [userRow] = rowsFromExecute<{ current_user: string; session_user: string }>(
    await db.execute(sql`
      SELECT current_user::text AS current_user, session_user::text AS session_user
    `)
  )

  const ownerRows = rowsFromExecute<{ owner: string; relrowsecurity: boolean }>(
    await db.execute(sql`
      SELECT
        pg_catalog.pg_get_userbyid(c.relowner)::text AS owner,
        c.relrowsecurity AS relrowsecurity
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'job_types'
        AND c.relkind = 'r'
    `)
  )

  if (!userRow?.current_user) {
    messages.push('Could not read current_user.')
    return {
      ok: false,
      current_user: null,
      owner: null,
      schema_usage_public: false,
      select_job_types: false,
      row_count: null,
      rls_enabled: null,
      messages,
    }
  }

  if (ownerRows.length === 0) {
    messages.push('Table public.job_types does not exist. Use “Recreate catalog” to create it.')
    return {
      ok: false,
      current_user: userRow.current_user,
      session_user: userRow.session_user,
      owner: null,
      schema_usage_public: false,
      select_job_types: false,
      row_count: null,
      rls_enabled: null,
      messages,
    }
  }

  const ownerRow = ownerRows[0]!

  const [perm] = rowsFromExecute<{ sch_use: boolean; sel: boolean }>(
    await db.execute(sql`
      SELECT
        pg_catalog.has_schema_privilege(${userRow.current_user}::text, 'public', 'USAGE') AS sch_use,
        pg_catalog.has_table_privilege(${userRow.current_user}::text, ${'public.job_types'}, 'SELECT')
          AS sel
    `)
  )

  let row_count: number | null = null
  try {
    const [cnt] = rowsFromExecute<{ n: number }>(
      await db.execute(sql`SELECT count(*)::int AS n FROM public.job_types`)
    )
    row_count = cnt?.n ?? 0
  } catch {
    row_count = null
  }

  const schema_usage_public = perm?.sch_use === true
  const select_job_types = perm?.sel === true

  if (!schema_usage_public) messages.push('Missing USAGE on schema public.')
  if (!select_job_types) messages.push('Missing SELECT on public.job_types.')

  return {
    ok: schema_usage_public && select_job_types,
    current_user: userRow.current_user,
    session_user: userRow.session_user,
    owner: ownerRow.owner,
    schema_usage_public,
    select_job_types,
    row_count,
    rls_enabled: ownerRow.relrowsecurity,
    messages,
  }
}

/** GRANT PUBLIC read access (usual fix when app role inherits PUBLIC grants). */
export async function repairJobTypesPublicGrants(): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw('GRANT USAGE ON SCHEMA public TO PUBLIC'))
      await tx.execute(sql.raw('GRANT SELECT ON TABLE public.job_types TO PUBLIC'))
    })
    const d = await getJobTypesCatalogDiagnostics()
    if (!d.ok) {
      return {
        ok: false,
        error:
          'GRANT PUBLIC ran but diagnostics still failing. Grant explicitly to DATABASE_URL role in SQL dashboard.',
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Drop + create job_types, re-seed default rows, reconnect FK + index + grants. Destructive. */
export async function recreateJobTypesCatalogTable(): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw('DROP TABLE IF EXISTS public.job_types CASCADE'))
      await tx.execute(sql.raw(`
        CREATE TABLE public.job_types (
          slug varchar(64) PRIMARY KEY,
          title varchar(255) NOT NULL,
          sort_order integer NOT NULL DEFAULT 0,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `))
      await tx.execute(sql.raw(`
        INSERT INTO public.job_types (slug, title, sort_order) VALUES
          ('development', 'Development', 10),
          ('meeting', 'Meeting', 20),
          ('support', 'Support / customer care', 30),
          ('review', 'Review / QA', 50),
          ('research', 'Research / investigation', 70),
          ('admin', 'Admin / internal', 80),
          ('other', 'Other', 999),
          ('ticket_work', 'Ticket Work', 10),
          ('revision', 'Revision', 10)
        ON CONFLICT (slug) DO NOTHING
      `))
      await tx.execute(sql.raw(`
        UPDATE public.ticket_time_tracker tt
        SET job_type = 'other'
        WHERE tt.job_type IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.slug = tt.job_type)
      `))
      await tx.execute(
        sql.raw(
          `ALTER TABLE ONLY public.ticket_time_tracker DROP CONSTRAINT IF EXISTS ticket_time_tracker_job_type_job_types_slug_fk`
        )
      )
      await tx.execute(
        sql.raw(
          `ALTER TABLE ONLY public.ticket_time_tracker DROP CONSTRAINT IF EXISTS ticket_time_tracker_job_type_fkey`
        )
      )
      await tx.execute(sql.raw(`
        ALTER TABLE ONLY public.ticket_time_tracker
          ADD CONSTRAINT ticket_time_tracker_job_type_job_types_slug_fk
          FOREIGN KEY (job_type) REFERENCES public.job_types (slug) ON DELETE SET NULL
      `))
      await tx.execute(
        sql.raw(
          `COMMENT ON TABLE public.job_types IS 'Time tracker work category choices; slug copied to ticket_time_tracker.job_type.'`
        )
      )
      await tx.execute(
        sql.raw(
          `COMMENT ON COLUMN public.ticket_time_tracker.job_type IS 'job_types.slug — what this session was for but not linked.'`
        )
      )
      await tx.execute(
        sql.raw(
          `CREATE INDEX IF NOT EXISTS ticket_time_tracker_job_type_idx ON public.ticket_time_tracker (job_type)`
        )
      )
      await tx.execute(sql.raw('GRANT USAGE ON SCHEMA public TO PUBLIC'))
      await tx.execute(sql.raw('GRANT SELECT ON TABLE public.job_types TO PUBLIC'))
    })
    const d = await getJobTypesCatalogDiagnostics()
    if (!d.ok && d.messages.length > 0) {
      return { ok: false, error: d.messages.join(' ') }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
