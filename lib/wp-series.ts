import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'

export type WpPoint = {
  at: string
  spam: number | null
  pending_comments: number | null
  forms_24h: number | null
  plugin_updates: number | null
  core_update: boolean
  failed_logins: number | null
  ssl_days_left: number | null
  admin_ids: number[]
}

/**
 * The few numbers of each report of a site over the last `days` days, oldest first. They are read inside the database,
 * so a report of tens of KB is never moved just to count its plugins: this feeds the trends and the spike and new-admin alarms.
 */
export async function loadWpSeries(siteId: string, days: number): Promise<WpPoint[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const rows = await db.execute(sql`
    SELECT
      created_at,
      CASE WHEN payload #>> '{comments,spam}' ~ '^[0-9]+$' THEN (payload #>> '{comments,spam}')::int END AS spam,
      CASE WHEN payload #>> '{comments,pending}' ~ '^[0-9]+$' THEN (payload #>> '{comments,pending}')::int END AS pending_comments,
      CASE WHEN jsonb_typeof(payload #> '{gravityforms,forms}') = 'array'
        THEN (SELECT COALESCE(SUM(CASE WHEN f->>'last_24h' ~ '^[0-9]+$' THEN (f->>'last_24h')::int ELSE 0 END), 0)::int
              FROM jsonb_array_elements(payload #> '{gravityforms,forms}') f) END AS forms_24h,
      CASE WHEN jsonb_typeof(payload #> '{updates,plugins}') = 'array' THEN jsonb_array_length(payload #> '{updates,plugins}') END AS plugin_updates,
      (payload #>> '{updates,core_update_available}') = 'true' AS core_update,
      CASE WHEN payload #>> '{users,failed_logins_24h}' ~ '^[0-9]+$' THEN (payload #>> '{users,failed_logins_24h}')::int END AS failed_logins,
      CASE WHEN payload #>> '{ssl,days_left}' ~ '^-?[0-9]+$' THEN (payload #>> '{ssl,days_left}')::int END AS ssl_days_left,
      CASE WHEN jsonb_typeof(payload #> '{users,administrators}') = 'array'
        THEN (SELECT COALESCE(jsonb_agg(a->'id'), '[]'::jsonb) FROM jsonb_array_elements(payload #> '{users,administrators}') a) ELSE '[]'::jsonb END AS admin_ids
    FROM wp_site_reports
    WHERE site_id = ${siteId}::uuid AND created_at >= ${since}::timestamptz
    ORDER BY created_at ASC
  `)
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    at: new Date(r.created_at as string).toISOString(),
    spam: r.spam as number | null,
    pending_comments: r.pending_comments as number | null,
    forms_24h: r.forms_24h as number | null,
    plugin_updates: r.plugin_updates as number | null,
    core_update: r.core_update === true,
    failed_logins: r.failed_logins as number | null,
    ssl_days_left: r.ssl_days_left as number | null,
    admin_ids: Array.isArray(r.admin_ids) ? (r.admin_ids as unknown[]).map(Number).filter(Number.isFinite) : [],
  }))
}
